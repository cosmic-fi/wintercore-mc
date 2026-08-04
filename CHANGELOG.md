# Changelog — wintercore-mc

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.3] — 2026-08-04

### Bug Fixes

- **Forge/NeoForge patcher unhandled error** — Fixed "Unhandled error (Le patcher Forge s'est terminé avec le code 1)" crash. The Java patcher process was emitting `error` events with no listeners, causing Node.js to throw an unhandled exception. Fixed by replacing `emit('error')` with Promise rejection in `patcher.ts`, wrapping patcher calls in try/catch in `forge.ts` and `neoForge.ts`, and adding error event forwarding in `Minecraft-Loader/index.ts`.

- **Error handling across all loaders** — Added missing error event forwarding and try/catch blocks for Fabric, LegacyFabric, and Quilt loaders to prevent unhandled errors during library downloads.

### Improvements

- **Complete error handling chain** — All loader errors now flow through a consistent chain: caught locally → returned as error objects → emitted as events → caught by promise rejection → displayed properly to user. This eliminates JavaScript error dialogs completely.

- **French text translation** — Translated all French comments, error messages, and license headers to English across the entire codebase for better maintainability.

### Files Changed

- `src/Minecraft-Loader/patcher.ts` — Replaced `emit('error')` with `throw`/`reject` for proper async error propagation
- `src/Minecraft-Loader/loader/forge/forge.ts` — Added try/catch for patcher errors, returns `{ error: ... }`
- `src/Minecraft-Loader/loader/neoForge/neoForge.ts` — Same fix as Forge
- `src/Minecraft-Loader/index.ts` — Added error event forwarding for all loaders (Forge, NeoForge, Fabric, LegacyFabric, Quilt)
- `src/utils/unzipper.ts` — Translated French safety comments to English
- `src/Launch.ts` — Cleaned up informal comments
- All loader files — Translated license headers from French to English

---

## [1.1.0] — 2026-08-03

### Performance

- **Native HTTP/HTTPS for downloads** — Replaced `fetch()` (undici) entirely with native `http.get()`/`https.get()` using global `http.Agent`/`https.Agent` with keep-alive enabled (`maxSockets: 50`, `maxFreeSockets: 20`). This reuses TCP/TLS connections instead of creating a new one per request, eliminating the connection exhaustion timeouts that occurred with 20+ concurrent downloads using undici's default pool (10 sockets per origin). Also eliminates web stream conversion overhead since `http.get` returns a native Node.js Readable stream directly.

- **Progress event throttling** — The `Downloader` and `Launch` classes now throttle `progress` events to a maximum of 10 per second (every 100ms or when percentage changes by ≥1%). Previously, a progress event was emitted on every single data chunk, which with 20 concurrent downloads flooded IPC channels and starved the event loop — this was the root cause of the launcher's cancel button not responding during downloads.

- **Parallel hash checking** — `MinecraftBundle.checkBundle()` now computes SHA-1 hashes for all files in parallel using `Promise.all()` instead of sequentially. This dramatically reduces the time spent verifying files before download begins, especially on first launch with hundreds of files.

- **Native web stream conversion** — `fromAnyReadable()` now uses `Readable.fromWeb()` directly (Node 17+ native API) instead of a manual `getReader()` + recursive Promise pump. This is significantly more efficient and properly handles backpressure.

### Bug Fixes

- **Download timeouts** — Fixed frequent `fetch failed` / timeout errors caused by undici's connection pool exhaustion. By replacing `fetch()` with native `http.get()`/`https.get()` and using keep-alive agents with 50 max sockets, high concurrency no longer causes connection queuing or timeouts.

- **Stream backpressure** — Replaced manual `stream.on('data')` / `stream.on('end')` handling in the Downloader with `stream/promises.pipeline()` + a `Transform` stream. This ensures proper backpressure, automatic error propagation, and cleanup — preventing memory spikes and potential data corruption on large downloads.

- **Cancel button unresponsive during download** — Fixed by throttling progress events at the source (Downloader) and at the Launch level, preventing the event loop from being starved by hundreds of progress events per second.

### Improvements

- **Reliable stream pipeline** — All download streams now use `stream/promises.pipeline()` for reliable backpressure handling, automatic error propagation, and guaranteed stream cleanup on failure.

- **TypeScript configuration** — Added `"types": ["node"]` to `tsconfig.json` to ensure `@types/node` is properly resolved by the compiler.

- **File permissions** — Changed file/directory creation modes from `0o777` to `0o755` for better security practices.

### Files Changed

- `src/utils/Downloader.ts` — Replaced `fetch()` with native `http.get()`/`https.get()`, connection pooling, progress throttling, pipeline streams, Transform-based progress tracking
- `src/utils/Index.ts` — `fromAnyReadable` now uses `Readable.fromWeb()` natively
- `src/Minecraft/Minecraft-Bundle.ts` — Parallel hash checking with `Promise.all()`
- `src/Launch.ts` — Progress event throttling at the Launch level
- `tsconfig.json` — Added `"types": ["node"]`

---

## [1.0.0] — Initial Release

- Core Minecraft launcher functionality (version downloading, asset management, library handling)
- Support for Forge, NeoForge, Fabric, LegacyFabric, and Quilt loaders
- Java runtime auto-download (Mojang + Adoptium fallback)
- Native library extraction
- Crash detection and reporting
- Memory management with object pooling
- Performance monitoring
- Resource pack configuration