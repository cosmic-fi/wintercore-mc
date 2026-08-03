# Known Bugs & Fixes — wintercore-mc

## Fixed in v1.1.0

- [x] **Frequent download timeouts with undici's fetch** — undici's default connection pool (10 sockets per origin) was exhausted when running 20 concurrent downloads, causing connections to queue and time out. Fixed by replacing `fetch()` entirely with native `http.get()`/`https.get()` using global `http.Agent`/`https.Agent` with `keepAlive: true` and `maxSockets: 50` for connection pooling and reuse. This also eliminates the web stream conversion overhead since `http.get` returns a native Node.js Readable stream directly.

- [x] **Progress event flooding** — The `Downloader` emitted a `progress` event on every single data chunk. With 20 concurrent downloads this flooded IPC channels and starved the event loop, causing the launcher's cancel button to not fire until the window was minimized or the page changed. Fixed by throttling progress events to max 10/sec (every 100ms or ≥1% change) at both the `Downloader` and `Launch` levels.

- [x] **Unreliable stream handling** — Manual `stream.on('data')` / `stream.on('end')` event handling in the Downloader didn't properly handle backpressure, leading to memory spikes and potential data loss on large downloads. Fixed by replacing manual stream handling with `stream/promises.pipeline()` + a `Transform` stream for progress tracking.

- [x] **Inefficient web stream conversion** — `fromAnyReadable` in `Index.ts` used a manual pump approach with `getReader()` + recursive Promise chains, creating a new Promise per chunk and not handling backpressure. Fixed by using `Readable.fromWeb()` directly (Node 17+ native conversion).

- [x] **Slow sequential hash checking** — `MinecraftBundle.checkBundle()` computed SHA-1 hashes sequentially for every file. On first launch with hundreds of files this was a major bottleneck. Fixed by running hash checks in parallel with `Promise.all()`.

- [x] **Missing `@types/node` in tsconfig** — TypeScript compiler couldn't find Node.js type definitions. Fixed by adding `"types": ["node"]` to `tsconfig.json`.

## Known Issues

- [ ] **Forge installer downloads can be slow** — The Forge installer download flow doesn't use the same connection pooling as the main Downloader. This is a minor issue since Forge installers are typically a single large file.
- [ ] **`getFileFromArchive` loads entire archive into memory** — For very large jar/zip files, the `Unzipper` class loads all entries into memory at once. This could be optimized with streaming extraction for large archives.