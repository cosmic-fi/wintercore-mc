import fs from 'fs';
import { EventEmitter } from 'events';
import { pipeline } from 'stream/promises';
import { Transform, Readable } from 'stream';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { 
    DownloadError, 
    TimeoutError, 
    ConnectionError, 
    FileSystemError, 
    ValidationError,
    ErrorCodes,
    wrapError
} from './Errors.js';

// Global HTTP/HTTPS agents with keep-alive for connection pooling.
// This is critical for performance: without keep-alive, every request
// creates a new TCP+TLS connection, which with 20 concurrent downloads
// exhausts resources and causes frequent timeouts.
// We use native http/https modules (not undici fetch) to get full
// control over connection pooling and avoid undici's connection limits.
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 20,
    timeout: 60000,
});

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 1000,
    maxSockets: 50,
    maxFreeSockets: 20,
    timeout: 60000,
});

/**
 * Interface for the response from httpRequest.
 */
interface HttpResponse {
    statusCode: number;
    headers: http.IncomingHttpHeaders;
    body: Readable;
}

/**
 * Performs an HTTP/HTTPS GET request using native Node.js modules
 * with keep-alive connection pooling. Returns a Node Readable stream
 * directly (no web stream conversion needed).
 *
 * @param url - The URL to fetch
 * @param options - Request options
 * @returns HttpResponse with status code, headers, and body stream
 */
function httpRequest(
    url: string,
    options: { signal?: AbortSignal; timeout?: number } = {}
): Promise<HttpResponse> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const agent = isHttps ? httpsAgent : httpAgent;
        const lib = isHttps ? https : http;
        const timeout = options.timeout || 30000;

        const req = lib.get(url, { agent }, (res) => {
            // Handle redirects (3xx)
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).href;
                res.resume(); // Consume the response to free up the socket
                httpRequest(redirectUrl, options).then(resolve).catch(reject);
                return;
            }

            resolve({
                statusCode: res.statusCode || 0,
                headers: res.headers,
                body: res as unknown as Readable,
            });
        });

        req.on('error', (err: any) => {
            if (options.signal?.aborted) {
                reject(new Error('Request aborted'));
            } else {
                reject(err);
            }
        });

        req.setTimeout(timeout, () => {
            req.destroy(new Error(`Request timeout after ${timeout}ms`));
        });

        if (options.signal) {
            options.signal.addEventListener('abort', () => {
                req.destroy(new Error('Request aborted'));
            });
        }
    });
}

/**
 * Helper function to perform an HTTP request with retries.
 * Uses native http/https modules for connection pooling.
 */
async function fetchWithRetry(
    url: string,
    retries = 3,
    delay = 1000,
    timeout = 30000,
    abortSignal?: AbortSignal
): Promise<HttpResponse> {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            const response = await httpRequest(url, { signal: abortSignal, timeout });
            // If successful or client error (4xx), return response
            if (response.statusCode >= 200 && response.statusCode < 400) {
                return response;
            }
            if (response.statusCode >= 400 && response.statusCode < 500) {
                return response; // Client errors are not retried
            }
            // If server error (5xx), throw to trigger retry
            if (response.statusCode >= 500) {
                response.body.resume(); // Consume the body to free the socket
                throw new Error(`Server returned ${response.statusCode}`);
            }
            return response;
        } catch (error: any) {
            lastError = error;
            // Don't retry if aborted
            if (error.message === 'Request aborted' || error.name === 'AbortError') {
                throw error;
            }
            // Log retry attempt
            console.log(`[Downloader] Fetch attempt ${i + 1} failed for ${url}: ${error.message}. Retrying...`);
            if (i < retries - 1) {
                await new Promise(resolve => setTimeout(resolve, delay * (i + 1))); // Exponential backoff
            }
        }
    }
    throw lastError;
}

/**
 * Describes a single file to be downloaded by the Downloader class.
 */
export interface DownloadOptions {
	/** The URL to download from */
	url: string;
	/** Local path (including filename) where the file will be saved */
	path: string;
	/** The total length of the file (in bytes), if known */
	length?: number;
	/** Local folder in which the file's path resides */
	folder: string;
	/** Optional type descriptor, used when emitting 'progress' events */
	type?: string;
}

/**
 * A class responsible for downloading single or multiple files,
 * emitting events for progress, speed, estimated time, and errors.
 */
export default class Downloader extends EventEmitter {
	// Progress throttling state - prevents emitting progress on every
	// data chunk, which floods IPC channels and starves event loops.
	private lastProgressEmit = 0;
	private lastProgressPercent = -1;
	private readonly PROGRESS_THROTTLE_MS = 100; // Max 10 progress events per second
	private readonly PROGRESS_THROTTLE_PERCENT = 1; // Or when percentage changes by >= 1%

	/**
	 * Creates a Transform stream that counts bytes and throttles progress events.
	 * This is used in pipeline() for reliable backpressure handling.
	 */
	private createProgressTransform(
		onProgress: (downloaded: number, totalSize: number) => void,
		totalSize: number
	): Transform {
		let downloaded = 0;
		// Capture throttle state in closure (not on `this` of Transform)
		let lastEmit = 0;
		let lastPercent = -1;
		const throttleMs = this.PROGRESS_THROTTLE_MS;
		const throttlePercent = this.PROGRESS_THROTTLE_PERCENT;
		
		return new Transform({
			transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null, data?: any) => void) {
				downloaded += chunk.length;
				
				// Throttle progress events
				const now = Date.now();
				const percent = totalSize > 0 ? (downloaded / totalSize) * 100 : 0;
				if (now - lastEmit >= throttleMs || 
				    percent - lastPercent >= throttlePercent) {
					lastEmit = now;
					lastPercent = percent;
					onProgress(downloaded, totalSize);
				}
				
				callback(null, chunk);
			}
		});
	}

	/**
	 * Downloads a single file from the given URL to the specified local path.
	 * Emits "progress" events with the number of bytes downloaded and total size.
	 *
	 * @param url - The remote URL to download from
	 * @param dirPath - Local folder path where the file is saved
	 * @param fileName - Name of the file (e.g., "mod.jar")
	 */
	public async downloadFile(url: string, dirPath: string, fileName: string): Promise<void> {
		try {
			if (!fs.existsSync(dirPath)) {
				fs.mkdirSync(dirPath, { recursive: true });
			}
		} catch (err: any) {
			const fsError = new FileSystemError(
				`Failed to create directory: ${err.message}`,
				dirPath,
				'mkdir',
				false,
				ErrorCodes.DIRECTORY_CREATE_FAILED
			);
			this.emit('error', fsError);
			throw fsError;
		}

		const filePath = `${dirPath}/${fileName}`;
		const writer = fs.createWriteStream(filePath);
		let response: HttpResponse;

		try {
			response = await fetchWithRetry(url, 3, 1000, 30000);
			
			if (response.statusCode < 200 || response.statusCode >= 300) {
				const downloadError = new DownloadError(
					`HTTP ${response.statusCode}: Failed to download ${fileName}`,
					url,
					response.statusCode,
					ErrorCodes.HTTP_ERROR
				);
				this.emit('error', downloadError);
				throw downloadError;
			}
		} catch (err: any) {
			writer.destroy();
			
			if (err instanceof DownloadError) {
				throw err;
			}
			
			const wrappedError = wrapError(err, { url, fileName });
			this.emit('error', wrappedError);
			throw wrappedError;
		}

		const contentLength = response.headers['content-length'];
		const totalSize = contentLength ? parseInt(contentLength as string, 10) : 0;

		this.lastProgressEmit = 0;
		this.lastProgressPercent = -1;

		try {
			const progressTransform = this.createProgressTransform(
				(downloaded, size) => this.emit('progress', downloaded, size),
				totalSize
			);
			
			// Use pipeline for reliable stream handling with backpressure.
			// response.body is already a Node Readable stream (from http.get),
			// so no web stream conversion is needed.
			await pipeline(response.body, progressTransform, writer);
		} catch (err: any) {
			writer.destroy();
			const wrappedError = wrapError(err, { url, fileName });
			this.emit('error', wrappedError);
			throw wrappedError;
		}
	}

	/**
	 * Downloads multiple files concurrently (up to the specified limit).
	 * Emits "progress" events with cumulative bytes downloaded vs. total size,
	 * as well as "speed" and "estimated" events for speed and ETA calculations.
	 * 
	 * Features adaptive concurrency control based on network performance.
	 */
	public async downloadFileMultiple(
		files: DownloadOptions[],
		size: number,
		limit: number = 1,
		timeout: number = 10000,
		abortSignal?: AbortSignal
	): Promise<void> {
		if (limit > files.length) limit = files.length;
		let completed = 0;
		let downloaded = 0;
		let queued = 0;
		let start = Date.now();
		let before = 0;
		const speeds: number[] = [];
		let aborted = false;
		const errors: Error[] = [];
		
		// Error rate limiting to prevent spam
		let lastErrorTime = 0;
		let errorCount = 0;
		const ERROR_RATE_LIMIT = 1000; // Minimum ms between error emissions
		const MAX_BURST_ERRORS = 5; // Maximum errors in a burst
		
		// Completion tracking to prevent duplicate logs
		let isCompleted = false;
		
		// Adaptive concurrency control
		let currentLimit = Math.min(limit, 5); // Start with conservative limit
		let adaptiveLimit = limit; // Maximum allowed limit
		let consecutiveSuccesses = 0;
		let consecutiveFailures = 0;
		const adaptInterval = 1000; // Adapt every second
		let lastAdaptTime = Date.now();

		// Reset progress throttle state
		this.lastProgressEmit = 0;
		this.lastProgressPercent = -1;

		// Handle abort signal
		if (abortSignal) {
			abortSignal.addEventListener('abort', () => {
				aborted = true;
			});
		}

		// Rate-limited error emission function
		const emitErrorWithRateLimit = (error: Error): void => {
			const now = Date.now();
			
			// Reset error count if enough time has passed
			if (now - lastErrorTime > ERROR_RATE_LIMIT * 2) {
				errorCount = 0;
			}
			
			// Only emit error if we haven't exceeded burst limit or time limit
			if (errorCount < MAX_BURST_ERRORS || now - lastErrorTime >= ERROR_RATE_LIMIT) {
				this.emit('error', error);
				lastErrorTime = now;
				errorCount++;
			} else if (errorCount === MAX_BURST_ERRORS) {
				// Log a warning once when rate limiting starts
				console.warn(`[Downloader] Error rate limiting active - suppressing repeated errors. Total errors: ${errors.length}`);
				errorCount++;
			}
		};

		const estimated = setInterval(() => {
			if (aborted) return;
			const duration = (Date.now() - start) / 1000;
			const chunkDownloaded = downloaded - before;
			if (speeds.length >= 5) speeds.shift();
			speeds.push(chunkDownloaded / duration);

			const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
			this.emit('speed', avgSpeed);

			const timeRemaining = (size - downloaded) / avgSpeed;
			this.emit('estimated', timeRemaining);

			start = Date.now();
			before = downloaded;
			
			// Adaptive concurrency control
			const now = Date.now();
			if (now - lastAdaptTime >= adaptInterval) {
				lastAdaptTime = now;
				
				// Adjust concurrency based on performance
				if (consecutiveSuccesses >= 3 && currentLimit < adaptiveLimit) {
					currentLimit = Math.min(currentLimit + 2, adaptiveLimit);
					consecutiveSuccesses = 0;
					console.log(`[Downloader] Increased concurrency to ${currentLimit}`);
				} else if (consecutiveFailures >= 2 && currentLimit > 3) {
					currentLimit = Math.max(currentLimit - 1, 3);
					consecutiveFailures = 0;
					console.log(`[Downloader] Decreased concurrency to ${currentLimit}`);
				}
			}
		}, 500);

		const downloadNext = async (): Promise<void> => {
			if (aborted || queued >= files.length) return;

			const file = files[queued++];
			
			try {
				if (!fs.existsSync(file.folder)) {
					fs.mkdirSync(file.folder, { recursive: true, mode: 0o755 });
				}
			} catch (err: any) {
				const fsError = new FileSystemError(
					`Failed to create directory: ${err.message}`,
					file.folder,
					'mkdir',
					false,
					ErrorCodes.DIRECTORY_CREATE_FAILED
				);
				errors.push(fsError);
				emitErrorWithRateLimit(fsError);
				completed++;
				downloadNext();
				return;
			}

			const writer = fs.createWriteStream(file.path, { flags: 'w', mode: 0o755 });
			const controller = new AbortController();
			const timeoutId = setTimeout(() => {
				controller.abort();
				const timeoutError = new TimeoutError(
							`Download timeout for ${file.url}`,
							timeout,
							ErrorCodes.NETWORK_TIMEOUT
						);
						errors.push(timeoutError);
						emitErrorWithRateLimit(timeoutError);
			}, timeout);

			try {
				if (aborted) {
					const abortError = new DownloadError('Download aborted by user', file.url, undefined, ErrorCodes.DOWNLOAD_INTERRUPTED);
					throw abortError;
				}
				
				const response = await fetchWithRetry(file.url, 3, 2000, timeout, controller.signal);
				clearTimeout(timeoutId);

				if (response.statusCode < 200 || response.statusCode >= 300) {
					const downloadError = new DownloadError(
						`HTTP ${response.statusCode}: Failed to download from ${file.url}`,
						file.url,
						response.statusCode,
						ErrorCodes.HTTP_ERROR
					);
					throw downloadError;
				}

				// response.body is already a Node Readable stream from http.get
				// No need for fromAnyReadable conversion!
				
				// Create a progress transform that updates the shared downloaded counter
				const progressTransform = this.createProgressTransform(
					(dl, _size) => {
						downloaded = dl;
					},
					size
				);

				// Use pipeline for reliable stream handling with backpressure
				await pipeline(response.body, progressTransform, writer);
				
				completed++;
				consecutiveSuccesses++;
				consecutiveFailures = 0;
				downloadNext();

			} catch (e: any) {
				writer.destroy();
				clearTimeout(timeoutId);
				
				let error: Error;
				if (e instanceof Error) {
					error = e;
				} else {
					error = wrapError(new Error(String(e)), { url: file.url, path: file.path });
				}
				
				// Add more context for fetch failures
				if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT')) {
					const enhancedError = new DownloadError(
						`Failed to download ${file.url}: ${error.message}. This may be due to network issues or server problems.`,
						file.url,
						undefined,
						ErrorCodes.DOWNLOAD_FAILED
					);
					error = enhancedError;
				}
				
				errors.push(error);
				emitErrorWithRateLimit(error);
				completed++;
				consecutiveFailures++;
				consecutiveSuccesses = 0;
				downloadNext();
			}
		};

		for (let i = 0; i < limit; i++) {
			downloadNext();
		}

		return new Promise((resolve, reject) => {
			const checkCompletion = () => {
				if (aborted) {
					clearInterval(estimated);
					reject(new DownloadError('Download aborted', '', undefined, ErrorCodes.DOWNLOAD_INTERRUPTED));
					return;
				}
				
				if (completed === files.length && !isCompleted) {
					isCompleted = true;
					clearInterval(estimated);
					
					// Ensure all streams are properly closed
					setTimeout(() => {
						// Allow some downloads to fail (especially assets) without stopping the entire process
						const failureRate = errors.length / files.length;
						const isCriticalFailure = failureRate > 0.1; // More than 10% failure rate is considered critical
						
						if (errors.length > 0 && isCriticalFailure) {
							console.log(`[Downloader] ${errors.length} downloads failed out of ${files.length} (${(failureRate * 100).toFixed(1)}% failure rate)`);
							reject(errors[0]);
						} else if (errors.length > 0) {
							console.log(`[Downloader] ${errors.length} downloads failed out of ${files.length} (${(failureRate * 100).toFixed(1)}% failure rate) - continuing with partial success`);
							resolve();
						} else {
							resolve();
						}
					}, 100); // Small delay to ensure all streams are closed
					
					// Prevent further checks once completed
					clearInterval(interval);
					return;
				}
			};
			
			const interval = setInterval(checkCompletion, 100);
			
			// Also check immediately
			checkCompletion();
		});
	}

	/**
	 * Performs a HEAD request on the given URL to check if it is valid (status=200)
	 * and retrieves the "content-length" if available.
	 *
	 * @param url The URL to check
	 * @param timeout Time in ms before the request times out
	 * @returns An object containing { size, status } or rejects with false
	 */
	public async checkURL(
		url: string,
		timeout: number = 10000
	): Promise<{ size: number; status: number } | false> {
		return new Promise((resolve) => {
			const parsedUrl = new URL(url);
			const isHttps = parsedUrl.protocol === 'https:';
			const agent = isHttps ? httpsAgent : httpAgent;
			const lib = isHttps ? https : http;

			const req = lib.request(url, { method: 'HEAD', agent }, (res) => {
				if (res.statusCode === 200) {
					const contentLength = res.headers['content-length'];
					const size = contentLength ? parseInt(contentLength as string, 10) : 0;
					res.resume();
					resolve({ size, status: 200 });
				} else {
					res.resume();
					resolve(false);
				}
			});

			req.on('error', () => resolve(false));
			req.setTimeout(timeout, () => {
				req.destroy();
				resolve(false);
			});

			req.end();
		});
	}

	/**
	 * Tries each mirror in turn, constructing an URL (mirror + baseURL). If a valid
	 * response is found (status=200), it returns the final URL and size. Otherwise, returns false.
	 *
	 * @param baseURL The relative path (e.g. "group/id/artifact.jar")
	 * @param mirrors An array of possible mirror base URLs
	 * @returns An object { url, size, status } if found, or false if all mirrors fail
	 */
	public async checkMirror(
		baseURL: string,
		mirrors: string[]
	): Promise<{ url: string; size: number; status: number } | false> {

		for (const mirror of mirrors) {
			const testURL = `${mirror}/${baseURL}`;
			const res = await this.checkURL(testURL);

			if (res !== false && res.status === 200) {
				return {
					url: testURL,
					size: res.size,
					status: 200
				};
			}
		}
		return false;
	}
}