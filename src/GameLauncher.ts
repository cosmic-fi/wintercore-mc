import { EventEmitter } from 'events';
import Launch, { type DownloadResult, type LaunchOPTS } from './Launch.js';

/**
 * Launch lifecycle.
 *
 * This is intentionally a separate runtime concern from the download pipeline.
 * The launcher consumes a DownloadResult produced by GameDownloader. It does
 * not download or emit download progress.
 */
export class GameLauncher extends EventEmitter {
    private launcher = new Launch();

    async Launch(opt: LaunchOPTS, downloadResult: DownloadResult) {
        let cleanedUp = false;
        let cleanup = () => {};
        const forwardData = (data: any) => this.emit('data', data);
        const forwardError = (error: any) => this.emit('error', error);
        const forwardClose = (data: any) => {
            this.emit('close', data);
            cleanup();
        };
        const forwardStarted = (data: any) => this.emit('started', data);
        const forwardComplete = (data: any) => this.emit('complete', data);
        const forwardCancelled = (data: any) => {
            this.emit('cancelled', data);
            cleanup();
        };

        cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;
            this.launcher.removeListener('data', forwardData);
            this.launcher.removeListener('error', forwardError);
            this.launcher.removeListener('close', forwardClose);
            this.launcher.removeListener('started', forwardStarted);
            this.launcher.removeListener('complete', forwardComplete);
            this.launcher.removeListener('cancelled', forwardCancelled);
        };

        this.launcher.on('data', forwardData);
        this.launcher.on('error', forwardError);
        this.launcher.on('close', forwardClose);
        this.launcher.on('started', forwardStarted);
        this.launcher.on('complete', forwardComplete);
        this.launcher.on('cancelled', forwardCancelled);

        try {
            return await this.launcher.launchPrepared(opt, downloadResult);
        } catch (error) {
            cleanup();
            throw error;
        }
    }

    async launch(opt: LaunchOPTS, downloadResult: DownloadResult) {
        return this.Launch(opt, downloadResult);
    }

    async cancel(): Promise<void> {
        return this.launcher.cancel();
    }
}
