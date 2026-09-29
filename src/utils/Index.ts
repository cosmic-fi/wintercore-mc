import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'node:stream';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import Unzipper from './unzipper.js';

// Global HTTP/HTTPS agents with keep-alive for connection pooling.
// Used by fetchJSON() to avoid undici's fetch connection pool limits.
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
 * Fetches JSON from a URL using native Node.js http/https modules
 * instead of undici's fetch. This avoids connection pool exhaustion
 * (undici defaults to 10 sockets per origin) and "fetch failed" errors.
 *
 * @param url - The URL to fetch JSON from
 * @param timeout - Request timeout in milliseconds (default: 30000)
 * @returns Parsed JSON response
 */
async function fetchJSON(url: string, timeout: number = 30000): Promise<any> {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const isHttps = parsedUrl.protocol === 'https:';
        const agent = isHttps ? httpsAgent : httpAgent;
        const lib = isHttps ? https : http;

        const req = lib.get(url, { agent }, (res) => {
            // Handle redirects (3xx)
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, url).href;
                res.resume();
                fetchJSON(redirectUrl, timeout).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}: Failed to fetch ${url}`));
                return;
            }

            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk: string) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (err) {
                    reject(new Error(`Failed to parse JSON from ${url}: ${err}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(timeout, () => {
            req.destroy(new Error(`Request timeout after ${timeout}ms`));
        });
    });
}


// This interface defines the structure of a Minecraft library rule.
interface LibraryRule {
	action: 'allow' | 'disallow';
	os?: {
		name?: string;
	};
	features?: any; // Adjust or remove if not used in your code
}

/**
 * Represents a Library object, possibly containing rules or additional fields.
 * Adjust according to your actual library structure.
 */
interface MinecraftLibrary {
	name: string;
	rules?: LibraryRule[];
	downloads?: {
		artifact?: {
			url?: string;
			size?: number;
		};
	};
	natives?: Record<string, string>;
	[key: string]: any; // Extend if needed
}

/**
 * Represents a minimal version JSON structure to check if it's considered "old" (pre-1.6 or legacy).
 */
interface MinecraftVersionJSON {
	assets?: string; // "legacy" or "pre-1.6" indicates older assets
	[key: string]: any;
}

/**
 * Parses a Gradle/Maven identifier string (like "net.minecraftforge:forge:1.19-41.0.63")
 * into a local file path (group/artifact/version) and final filename (artifact-version.jar).
 * Optionally allows specifying a native string suffix or forcing an extension.
 *
 * @param main         A Gradle-style coordinate (group:artifact:version[:classifier])
 * @param nativeString A suffix for native libraries (e.g., "-natives-linux")
 * @param forceExt     A forced file extension (default is ".jar")
 * @returns An object with `path` and `name`, where `path` is the directory path and `name` is the filename
 */
function getPathLibraries(main: string, nativeString?: string, forceExt?: string) {
	// Example "net.minecraftforge:forge:1.19-41.0.63"
	const libSplit = main.split(':');

	// If there's a fourth element, it's typically a classifier appended to version
	const fileName = libSplit[3] ? `${libSplit[2]}-${libSplit[3]}` : libSplit[2];

	// Replace '@' in versions if present (e.g., "1.0@beta" => "1.0.beta")
	let finalFileName = fileName.includes('@')
		? fileName.replace('@', '.')
		: `${fileName}${nativeString || ''}${forceExt || '.jar'}`;

	// Construct the path: "net.minecraftforge" => "net/minecraftforge"
	// artifact => "forge"
	// version => "1.19-41.0.63"
	const pathLib = `${libSplit[0].replace(/\./g, '/')}/${libSplit[1]}/${libSplit[2].split('@')[0]}`;

	return {
		path: pathLib,
		name: `${libSplit[1]}-${finalFileName}`,
		version: libSplit[2],
	};
}

/**
 * Computes a hash (default SHA-1) of the given file by streaming its contents.
 *
 * @param filePath   Full path to the file on disk
 * @param algorithm  Hashing algorithm (default: "sha1")
 * @returns          A Promise resolving to the hex string of the file's hash
 */
async function getFileHash(filePath: string, algorithm: string = 'sha1'): Promise<string> {
	const shasum = crypto.createHash(algorithm);
	const fileStream = fs.createReadStream(filePath);

	return new Promise((resolve) => {
		fileStream.on('data', (data) => {
			shasum.update(data);
		});

		fileStream.on('end', () => {
			resolve(shasum.digest('hex'));
		});
	});
}

/**
 * Determines if a given Minecraft version JSON is considered "old"
 * by checking its assets field (e.g., "legacy" or "pre-1.6").
 *
 * @param json The Minecraft version JSON
 * @returns true if it's an older version, false otherwise
 */
function isold(json: MinecraftVersionJSON): boolean {
	return json.assets === 'legacy' || json.assets === 'pre-1.6';
}

/**
 * Returns metadata necessary to download specific loaders (Forge, Fabric, etc.)
 * based on a loader type string (e.g., "forge", "fabric").
 * If the loader type is unrecognized, returns undefined.
 *
 * @param type A string representing the loader type
 */
function loader(type: string) {
	if (type === 'forge') {
		return {
			metaData: 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.json',
			meta: 'https://files.minecraftforge.net/net/minecraftforge/forge/${build}/meta.json',
			promotions: 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json',
			install: 'https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-installer',
			universal: 'https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-universal',
			client: 'https://maven.minecraftforge.net/net/minecraftforge/forge/${version}/forge-${version}-client'
		};
	} else if (type === 'neoforge') {
		return {
			legacyMetaData: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/forge',
			metaData: 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge',
			legacyInstall: 'https://maven.neoforged.net/releases/net/neoforged/forge/${version}/forge-${version}-installer.jar',
			install: 'https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar'
		};
	} else if (type === 'fabric') {
		return {
			metaData: 'https://meta.fabricmc.net/v2/versions',
			json: 'https://meta.fabricmc.net/v2/versions/loader/${version}/${build}/profile/json'
		};
	} else if (type === 'legacyfabric') {
		return {
			metaData: 'https://meta.legacyfabric.net/v2/versions',
			json: 'https://meta.legacyfabric.net/v2/versions/loader/${version}/${build}/profile/json'
		};
	} else if (type === 'quilt') {
		return {
			metaData: 'https://meta.quiltmc.org/v3/versions',
			json: 'https://meta.quiltmc.org/v3/versions/loader/${version}/${build}/profile/json'
		};
	}
	// If none match, return undefined
}

/**
 * A list of potential Maven mirrors for downloading libraries.
 */
const mirrors = [
	'https://maven.minecraftforge.net',
	'https://maven.neoforged.net/releases',
	'https://maven.creeperhost.net',
	'https://libraries.minecraft.net',
	'https://repo1.maven.org/maven2'
];

/**
 * Reads a .jar or .zip file, returning specific entries or listing file entries in the archive.
 *
 * @param jar    Full path to the jar/zip file
 * @param file   The file entry to extract data from (e.g., "install_profile.json"). If null, returns all entries or partial lists.
 * @param prefix A path prefix filter (e.g., "maven/org/lwjgl/") if you want a list of matching files instead of direct extraction
 * @returns      A buffer or an array of { name, data }, or a list of filenames if prefix is given
 */
async function getFileFromArchive(jar: string, file: string | null = null, prefix: string | null = null, includeDirs: boolean = false): Promise<any> {
	const result: any[] = [];
	const zip = new Unzipper(jar);
	const entries = zip.getEntries();

	return new Promise((resolve) => {
		for (const entry of entries) {
			if (includeDirs ? !prefix : (!entry.isDirectory && !prefix)) {
				// If no prefix is given, either return a specific file if 'file' is set,
				// or accumulate all entries if 'file' is null
				if (entry.entryName === file) {
					return resolve(entry.getData());
				} else if (!file) {
					result.push({ name: entry.entryName, data: entry.getData(), isDirectory: entry.isDirectory });
				}
			}

			// If a prefix is given, collect all entry names under that prefix
			if (!entry.isDirectory && prefix && entry.entryName.includes(prefix)) {
				result.push(entry.entryName);
			}
		}

		if (file && !prefix) {
			// If a specific file was requested but not found, return undefined or empty
			return resolve(undefined);
		}

		// Otherwise, resolve the array of results
		resolve(result);
	});
}

/**
 * Determines if a library should be skipped based on its 'rules' property.
 * For example, it might skip libraries if action='disallow' for the current OS,
 * or if there are specific conditions not met.
 *
 * @param lib A library object (with optional 'rules' array)
 * @returns true if the library should be skipped, false otherwise
 */
function skipLibrary(lib: MinecraftLibrary): boolean {
	// Map Node.js platform strings to Mojang's naming
	const LibMap: Record<string, string> = {
		win32: 'windows',
		darwin: 'osx',
		linux: 'linux'
	};

	// If no rules, it's not skipped
	if (!lib.rules) {
		return false;
	}

	let shouldSkip = true;

	for (const rule of lib.rules) {
		// If features exist, your logic can handle them here
		if (rule.features) {
			// Implementation is up to your usage
			continue;
		}

		// "allow" means it can be used if OS matches (or no OS specified)
		// "disallow" means skip if OS matches (or no OS specified)
		if (
			rule.action === 'allow' &&
			((rule.os && rule.os.name === LibMap[process.platform]) || !rule.os)
		) {
			shouldSkip = false;
		} else if (
			rule.action === 'disallow' &&
			((rule.os && rule.os.name === LibMap[process.platform]) || !rule.os)
		) {
			shouldSkip = true;
		}
	}

	return shouldSkip;
}

function fromAnyReadable(webStream: ReadableStream<Uint8Array>): import('node:stream').Readable {
	// Use Readable.fromWeb() directly - it's available in Node 17+ and
	// is much more efficient than manual pumping. The manual pump approach
	// creates a new Promise per chunk and doesn't handle backpressure properly.
	if (typeof (Readable as any).fromWeb === 'function') {
		return (Readable as any).fromWeb(webStream as any);
	}

	// Fallback for older Node versions
	const nodeStream = new Readable({ read() { } });
	const reader = webStream.getReader();

	(function pump() {
		reader.read().then(({ done, value }) => {
			if (done) return nodeStream.push(null);
			nodeStream.push(Buffer.from(value));
			pump();
		}).catch(err => nodeStream.destroy(err));
	})();

	return nodeStream;
}

// Export all utility functions and constants
export {
	getPathLibraries,
	getFileHash,
	isold,
	loader,
	mirrors,
	getFileFromArchive,
	skipLibrary,
	fromAnyReadable,
	fetchJSON
};

// Export memory management
export * from './MemoryManager.js';

// Export error types
export * from './Errors.js';
