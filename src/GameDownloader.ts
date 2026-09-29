import { EventEmitter } from 'events';
import Launch, { type LaunchOPTS, type DownloadResult } from './Launch.js';

/**
 * Download-only lifecycle.
 *
 * This is a separate runtime concern from game launching. It is intentionally
 * responsible only for preparing/validating the Minecraft files and emits
 * download-focused events such as progress, estimated_time, complete and error.
 */
export class GameDownloader extends EventEmitter {
    private launcher = new Launch();

    async download(opt: LaunchOPTS): Promise<DownloadResult | { error: string }> {
        const events = [
            'progress', 'speed', 'estimated_time', 'extract', 'check', 'patch',
            'downloads_complete', 'recoverable_error', 'fatal_error',
            'download_error', 'network_error', 'ori_error', 'complete', 'error', 'cancelled'
        ] as const;
        const listeners = new Map<string, (...args: any[]) => void>();

        for (const event of events) {
            const listener = (...args: any[]) => this.emit(event, ...args);
            listeners.set(event, listener);
            this.launcher.on(event, listener);
        }

        try {
            return await this.launcher.download(opt);
        } finally {
            for (const event of events) {
                this.launcher.removeListener(event, listeners.get(event)!);
            }
        }
    }

    async downloadOnly(opt: LaunchOPTS): Promise<DownloadResult | { error: string }> {
        return this.download(opt);
    }

    async cancel(): Promise<void> {
        return this.launcher.cancel();
    }
}
