import Launch, { type LaunchOPTS, type DownloadResult } from './Launch.js';
import { GameDownloader } from './GameDownloader.js';
import { GameLauncher } from './GameLauncher.js';
import Status, { getServerStatus, parseServerAddress } from './StatusServer/status.js';
import Downloader from './utils/Downloader.js';
import { MemoryManager, StringBuilder, BufferedFileReader } from './utils/MemoryManager.js';
import PerformanceMonitor from './utils/PerformanceMonitor.js';
export type { LaunchOPTS, DownloadResult } from './Launch.js';

export {
    Launch as Launch,
    GameDownloader as GameDownloader,
    GameLauncher as GameLauncher,
    Status as Status,
    getServerStatus as getServerStatus,
    parseServerAddress as parseServerAddress,
    Downloader as Downloader,
    MemoryManager as MemoryManager,
    StringBuilder as StringBuilder,
    BufferedFileReader as BufferedFileReader,
    PerformanceMonitor as PerformanceMonitor
};

export const download = (opt: LaunchOPTS) => new GameDownloader().download(opt);
export const launch = (opt: LaunchOPTS, downloadResult: DownloadResult) => new GameLauncher().launch(opt, downloadResult);
