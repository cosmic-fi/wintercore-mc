import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Downloader } from '../build/Index.js';

const directory = await mkdtemp(path.join(os.tmpdir(), 'wintercore-cancel-'));
let requestStartedResolve;
let responseClosedResolve;
const requestStarted = new Promise((resolve) => {
    requestStartedResolve = resolve;
});
const responseClosed = new Promise((resolve) => {
    responseClosedResolve = resolve;
});

const server = http.createServer((_request, response) => {
    response.on('close', responseClosedResolve);
    response.writeHead(200, { 'Content-Length': '100000000' });
    response.write(Buffer.alloc(64 * 1024));
    requestStartedResolve();
});

try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const downloader = new Downloader();
    let emittedErrors = 0;
    downloader.on('error', () => {
        emittedErrors++;
    });
    const controller = new AbortController();
    const download = downloader.downloadFileMultiple([{
        url: `http://127.0.0.1:${address.port}/slow`,
        path: path.join(directory, 'large.bin'),
        folder: directory
    }], 100000000, 1, 30000, controller.signal);

    await requestStarted;
    controller.abort();
    await assert.rejects(download, /Download aborted/);
    assert.equal(emittedErrors, 0, 'user cancellation should not emit per-file download failures');

    const responseClosedInTime = await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        responseClosed.then(() => {
            clearTimeout(timer);
            resolve(true);
        });
    });
    assert.equal(responseClosedInTime, true, 'cancellation should close the active HTTP response');
    console.log('Downloader cancellation aborts active requests');
} finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
}