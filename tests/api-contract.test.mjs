import assert from 'node:assert/strict';
import { Launch, GameDownloader, GameLauncher } from '../build/Index.js';

assert.equal(typeof Launch.prototype.downloadOnly, 'function', 'Missing downloadOnly API');
assert.equal(typeof Launch.prototype.launch, 'function', 'Missing launch API convenience wrapper');
assert.equal(typeof Launch.prototype.Launch, 'function', 'Missing legacy Launch API');
assert.equal(typeof Launch.prototype.launchPrepared, 'function', 'Missing prepared launch API');
assert.equal(typeof GameDownloader.prototype.download, 'function', 'Missing GameDownloader API');
assert.equal(typeof GameDownloader.prototype.cancel, 'function', 'Missing GameDownloader cancellation API');
assert.equal(typeof GameLauncher.prototype.launch, 'function', 'Missing GameLauncher API');
assert.equal(typeof GameLauncher.prototype.cancel, 'function', 'Missing GameLauncher cancellation API');

console.log('wintercore-mc API contract OK');
