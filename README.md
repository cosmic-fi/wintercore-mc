# Winter Core

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
![Node Version](https://img.shields.io/badge/node-%3E%3D22.13.0-brightgreen)

**Winter Core** is a powerful **Node.js/TypeScript** library designed to simplify Minecraft Java Edition launcher development. It provides a complete solution for game launching, authentication, mod loading, and asset management without the complexity of handling manifests, libraries, or Java runtimes manually.

## 🎯 What is Winter Core?

Winter Core eliminates the tedious work of building Minecraft launchers from scratch. Whether you're creating a custom launcher for a modpack, building a server management tool, or developing a gaming platform, Winter Core handles all the low-level Minecraft launching logic so you can focus on your user experience.

## ✨ Key Features

- 🚀 **One-line game launching** - Launch any Minecraft version with minimal configuration
- 🔐 **Multi-platform authentication** - Microsoft, Mojang, and custom AZauth server support
- 🔧 **Universal mod loader support** - Forge, NeoForge, Fabric, Quilt, and Legacy Fabric
- 📦 **Intelligent asset management** - Automatic download, verification, and caching
- ⚡ **High-performance downloads** - Parallel downloading with progress tracking and retry logic
- 🎯 **Smart Java detection** - Automatic JVM discovery and version management
- 📊 **Real-time events** - Progress, speed, extraction, and error events
- 🛡️ **Robust file handling** - SHA-1 verification, resume support, and error recovery
- 🖥️ **Cross-platform ready** - Windows, macOS, and Linux compatibility
- 🎮 **Instance management** - Support for multiple game profiles and configurations
- 🔍 **Server status ping** - Query Minecraft server status directly

## 📦 Installation

```bash
npm install winter-core
```

## 🚀 Quick Start

### Basic Launch Example

```typescript
import { Launch, Microsoft, Mojang, AZauth } from 'winter-core';

const launcher = new Launch();

// Microsoft Authentication
const microsoft = new Microsoft('your-client-id');
const auth = await microsoft.getAuth();

// Launch Minecraft
launcher.Launch({
    path: '/path/to/.minecraft',
    version: '1.20.4',
    authenticator: auth,
    memory: {
        min: '2G',
        max: '4G'
    },
    loader: {
        type: 'fabric',
        build: 'latest',
        enable: true
    },
    verify: false
});

// Listen to events
launcher.on('progress', (downloaded, total, file) => {
    console.log(`Downloading: ${file} (${downloaded}/${total})`);
});

launcher.on('data', (data) => {
    console.log(data); // Minecraft console output
});

launcher.on('close', (info) => {
    console.log(`Minecraft closed. Code: ${info.code}`);
});
```

## 📖 API Reference

### Launch

The main class for launching Minecraft instances. Extends `EventEmitter`.

#### Constructor

```typescript
const launcher = new Launch();
```

#### Methods

##### `Launch(options: LaunchOPTS)`

Starts the launch process with the provided options.

```typescript
launcher.Launch({
    path: string,              // Absolute path to Minecraft root directory
    version: string,           // Minecraft version (e.g., '1.20.4', 'latest_release')
    authenticator: any,        // Auth object from Microsoft, Mojang, or AZauth
    timeout?: number,          // Connection timeout in milliseconds (default: 10000)
    instance?: string,         // Instance name for isolated game data
    detached?: boolean,        // Run Minecraft process independently (default: false)
    downloadFileMultiple?: number,  // Concurrent downloads (default: 5, max: 30)
    bypassOffline?: boolean,   // Skip online checks (default: false)
    verify?: boolean,          // Verify game files on launch (default: false)
    ignored?: string[],        // Files to ignore from instance
    loader?: {
        path?: string,         // Path to loader directory (relative to MC root)
        type?: string,         // 'forge', 'neoforge', 'fabric', 'legacyfabric', 'quilt'
        build?: string,        // 'latest', 'recommended', or specific version
        enable?: boolean       // Enable mod loader (default: false)
    },
    mcp?: any,                 // MCPatcher directory
    JVM_ARGS?: string[],       // Custom JVM arguments
    GAME_ARGS?: string[],      // Custom game arguments
    java?: {
        path?: string,         // Absolute path to Java binaries
        version?: string,      // Java version number
        type: string           // 'jdk', 'jre', 'testimage', 'debugimage', etc.
    },
    screen?: {
        width?: number,        // Window width
        height?: number,       // Window height
        fullscreen?: boolean   // Fullscreen mode (default: false)
    },
    memory?: {
        min?: string,          // -Xms value (default: '1G')
        max?: string           // -Xmx value (default: '2G')
    },
    resourcePacks?: Array<{    // Resource packs to enable
        name: string,
        fileName: string,
        filePath: string
    }>,
    url?: string | null,       // URL to launcher backend (Selvania setup)
    intelEnabledMac?: boolean  // Intel Mac support flag
});
```

##### `cancel()`

Cancels the launch process and terminates the Minecraft process if running.

```typescript
await launcher.cancel();
```

##### `launching: boolean`

Returns whether a launch is currently in progress.

```typescript
if (launcher.launching) {
    console.log('Launch in progress...');
}
```

##### `cancelled: boolean`

Returns whether the launch was cancelled.

```typescript
if (launcher.cancelled) {
    console.log('Launch was cancelled');
}
```

##### `getMemoryStats()`

Returns memory usage statistics.

```typescript
const stats = launcher.getMemoryStats();
console.log(stats); // { pools: number, totalObjects: number, heapUsed: number }
```

##### `forceGarbageCollection()`

Forces garbage collection (requires `--expose-gc` flag).

```typescript
launcher.forceGarbageCollection();
```

#### Events

| Event | Parameters | Description |
|-------|-----------|-------------|
| `progress` | `(downloaded: number, total: number, file: string)` | Download progress updates |
| `speed` | `(speed: number)` | Download speed |
| `estimated_time` | `(time: number)` | Estimated time remaining |
| `extract` | `(progress: any)` | File extraction progress |
| `check` | `(progress: any, size: any, element: any)` | File verification progress |
| `patch` | `(patch: any)` | Mod loader patching progress |
| `data` | `(data: string)` | Minecraft console output |
| `close` | `(info: { code, signal, runtime, isCrash, timeSinceLastOutput })` | Game closed |
| `complete` | `(info: { message, process, performance })` | Launch completed successfully |
| `error` | `(error: any)` | Error occurred |
| `cancelled` | `(info: { message, wasLaunching, hadProcess })` | Launch cancelled |
| `downloads_complete` | `(info: { message, fileCount })` | All downloads finished |

---

### Microsoft Authentication

Handles Microsoft OAuth2 authentication with Xbox Live integration.

```typescript
import { Microsoft } from 'winter-core';

const microsoft = new Microsoft('your-client-id'); // Optional, defaults to Minecraft launcher ID
```

#### Methods

##### `getAuth(type?, url?)`

Initiates authentication flow. Auto-detects environment (Electron, NW.js, or Terminal).

```typescript
const auth = await microsoft.getAuth();
// Returns AuthResponse | AuthError | false (if cancelled)
```

##### `refresh(account)`

Refreshes an existing authentication token.

```typescript
const refreshed = await microsoft.refresh(existingAuth);
```

##### `getProfile(mcLogin)`

Fetches Minecraft profile including skins and capes.

```typescript
const profile = await microsoft.getProfile({ access_token: 'token' });
// Returns { id, name, skins[], capes[] }
```

#### AuthResponse Structure

```typescript
{
    access_token: string,
    client_token: string,
    uuid: string,
    name: string,
    refresh_token: string,
    user_properties: string,
    meta: {
        type: 'Xbox',
        access_token_expires_in: number,
        demo: boolean
    },
    xboxAccount: {
        xuid: string,
        gamertag: string,
        ageGroup: string
    },
    profile: {
        skins?: Array<{ id, state, url, variant, alias, base64 }>,
        capes?: Array<{ id, state, url, variant, alias, base64 }>
    }
}
```

---

### Mojang Authentication

Handles Mojang authentication (legacy accounts and offline mode).

```typescript
import * as Mojang from 'winter-core';
```

#### Methods

##### `login(username, password?)`

Logs in with Mojang credentials. If no password is provided, creates an offline session.

```typescript
// Offline mode
const offlineAuth = await Mojang.login('PlayerName');

// Online mode
const onlineAuth = await Mojang.login('email@example.com', 'password');
```

##### `refresh(account)`

Refreshes a Mojang authentication token.

```typescript
const refreshed = await Mojang.refresh(auth);
```

##### `validate(account)`

Validates if an access token is still valid.

```typescript
const isValid = await Mojang.validate(auth);
```

##### `signout(account)`

Invalidates an access token.

```typescript
const success = await Mojang.signout(auth);
```

##### `ChangeAuthApi(url)`

Changes the authentication API URL for custom auth servers.

```typescript
Mojang.ChangeAuthApi('https://your-auth-server.com');
```

---

### AZauth

Authentication for custom launcher backends using the AZauth protocol.

```typescript
import { AZauth } from 'winter-core';

const azauth = new AZauth('https://your-server.com');
```

#### Methods

##### `login(username, password, A2F?)`

Authenticates with username/email and password. Supports 2FA.

```typescript
const user = await azauth.login('user@example.com', 'password');

// With 2FA
const user2FA = await azauth.login('user@example.com', 'password', '123456');
```

##### `verify(user)`

Verifies an existing session.

```typescript
const verified = await azauth.verify(user);
```

##### `signout(user)`

Logs out and invalidates a session.

```typescript
const success = await azauth.signout(user);
```

---

### Status Server

Query Minecraft server status information.

```typescript
import { Status } from 'winter-core';

const server = new Status('play.hypixel.net', 25565);

try {
    const status = await server.getStatus();
    console.log(status);
    // {
    //     error: false,
    //     ms: 45,
    //     version: '1.8-1.20',
    //     playersConnect: 12345,
    //     playersMax: 50000
    // }
} catch (error) {
    console.error('Server is offline or unreachable');
}
```

---

### Downloader

Advanced file downloader with progress tracking and retry logic.

```typescript
import { Downloader } from 'winter-core';

const downloader = new Downloader();

// Single file download
await downloader.downloadFile(url, dirPath, fileName);

// Multiple concurrent downloads
await downloader.downloadFileMultiple(files, totalSize, concurrent, timeout, signal);

// Events
downloader.on('progress', (downloaded, total, file) => {
    console.log(`Progress: ${downloaded}/${total}`);
});

downloader.on('speed', (speed) => {
    console.log(`Speed: ${speed} bytes/s`);
});

downloader.on('estimated', (time) => {
    console.log(`Estimated time: ${time}s`);
});
```

---

### MemoryManager

Memory pooling utilities for performance optimization.

```typescript
import { MemoryManager, StringBuilder, BufferedFileReader } from 'winter-core';

const memoryManager = MemoryManager.getInstance();

// Get object from pool or create new
const stringBuilder = memoryManager.getFromPool('StringBuilder', () => new StringBuilder());

// Return to pool for reuse
memoryManager.returnToPool('StringBuilder', stringBuilder, (obj) => obj.clear());

// Clear all pools
memoryManager.clearPools();

// Force garbage collection
memoryManager.forceGC();

// Get memory stats
const stats = memoryManager.getMemoryStats();
```

---

### PerformanceMonitor

Monitors launch and download performance metrics.

```typescript
import PerformanceMonitor from 'winter-core';

const monitor = PerformanceMonitor.getInstance();
monitor.startLaunchMonitoring();

// Later...
const metrics = monitor.stopMonitoring();
```

## 📚 Advanced Usage

### Instance Management

Launch multiple Minecraft instances with isolated game data:

```typescript
launcher.Launch({
    path: '/path/to/.minecraft',
    instance: 'MyModpack',  // Creates /path/to/.minecraft/instances/MyModpack/
    version: '1.20.1',
    authenticator: auth,
    loader: {
        type: 'forge',
        build: 'latest',
        enable: true
    }
});
```

### Custom JVM and Game Arguments

```typescript
launcher.Launch({
    path: '/path/to/.minecraft',
    version: '1.20.4',
    authenticator: auth,
    JVM_ARGS: [
        '-XX:+UseG1GC',
        '-XX:+UnlockExperimentalVMOptions',
        '-Dfml.ignoreInvalidMinecraftCertificates=true'
    ],
    GAME_ARGS: [
        '--width', '1920',
        '--height', '1080'
    ]
});
```

### Resource Packs

```typescript
launcher.Launch({
    path: '/path/to/.minecraft',
    version: '1.20.4',
    authenticator: auth,
    resourcePacks: [
        {
            name: 'Faithful 64x',
            fileName: 'Faithful-64x.zip',
            filePath: '/path/to/Faithful-64x.zip'
        }
    ]
});
```

### Mod Loader Configuration

```typescript
// Fabric
loader: {
    type: 'fabric',
    build: '0.16.3',
    enable: true
}

// Forge
loader: {
    type: 'forge',
    build: 'recommended',
    enable: true
}

// NeoForge
loader: {
    type: 'neoforge',
    build: 'latest',
    enable: true
}

// Custom loader path
loader: {
    path: './custom-loader',
    type: 'fabric',
    build: '0.15.0',
    enable: true
}
```

### Cancellation

```typescript
const launcher = new Launch();

// Start launch
launcher.Launch({ /* options */ });

// Cancel after 5 seconds
setTimeout(async () => {
    await launcher.cancel();
    console.log('Launch cancelled');
}, 5000);
```

### Server Status Monitoring

```typescript
const servers = [
    new Status('hypixel.net', 25565),
    new Status('mineplex.com', 25565),
    new Status('cubecraft.net', 25565)
];

for (const server of servers) {
    try {
        const status = await server.getStatus();
        console.log(`${server.ip}: ${status.playersConnect}/${status.playersMax} players`);
    } catch (error) {
        console.log(`${server.ip}: Offline`);
    }
}
```

## 🏗️ Architecture

```
src/
├── Index.ts              # Main exports
├── Launch.ts             # Core launcher logic
├── Authenticator/
│   ├── Microsoft.ts      # Microsoft/Xbox Live auth
│   ├── Mojang.ts         # Mojang/Offline auth
│   └── AZauth.ts         # Custom server auth
├── Minecraft/
│   ├── Minecraft-Json.ts       # Version manifests
│   ├── Minecraft-Libraries.ts  # Library management
│   ├── Minecraft-Assets.ts     # Asset management
│   ├── Minecraft-Java.ts       # JVM download/management
│   ├── Minecraft-Loader.ts     # Mod loader installation
│   ├── Minecraft-Bundle.ts     # File bundle management
│   ├── Minecraft-Arguments.ts  # Launch argument generation
│   └── Minecraft-Lwjgl-Native.ts # LWJGL native libraries
├── Minecraft-Loader/
│   ├── index.ts          # Loader index
│   ├── patcher.ts        # Loader patching
│   └── loader/           # Loader-specific implementations
├── StatusServer/
│   ├── status.ts         # Server status pinger
│   └── buffer.ts         # Protocol buffer utilities
└── utils/
    ├── Downloader.ts     # Advanced downloader
    ├── MemoryManager.ts  # Memory pooling
    ├── PerformanceMonitor.ts  # Performance tracking
    ├── Errors.ts         # Error handling
    ├── Index.ts          # Utility functions
    └── unzipper.ts       # ZIP extraction
```

## 🔧 Development

```bash
# Install dependencies
npm install

# Development mode (watch)
npm run dev

# Build
npm run build
```

## 📝 Requirements

- Node.js >= 22.13.0
- TypeScript 5.x

## 📄 License

MIT License 

## 🔗 Links

- [GitHub Repository](https://github.com/cosmic-fi/winter-core)
- [Report Issues](https://github.com/cosmic-fi/winter-core/issues)
- [npm Package](https://www.npmjs.com/package/winter-core)
