import net from 'net'
import createBuffer from './buffer.js';

function normalizeMotd(description: any): string {
    if (typeof description === 'string') return description;
    if (!description || typeof description !== 'object') return '';

    const parts = [description.text || ''];
    if (Array.isArray(description.extra)) {
        parts.push(...description.extra.map((part: any) => normalizeMotd(part)));
    }
    return parts.join('');
}

function ping(server: any, port: any, callback: any, timeout: any, protocol: any = '') {
    let start: any = new Date();
    let socket = net.connect({
        port: port,
        host: server
    }, () => {
        let handshakeBuffer = new createBuffer();

        handshakeBuffer.writeletInt(0);
        handshakeBuffer.writeletInt(protocol);
        handshakeBuffer.writeString(server);
        handshakeBuffer.writeUShort(port);
        handshakeBuffer.writeletInt(1);

        writePCBuffer(socket, handshakeBuffer);

        let setModeBuffer = new createBuffer();

        setModeBuffer.writeletInt(0);

        writePCBuffer(socket, setModeBuffer);
    });

    socket.setTimeout(timeout, () => {
        if (callback) callback(new Error("Socket timed out when connecting to " + server + ":" + port), null);
        socket.destroy();
    });

    let readingBuffer = Buffer.alloc(0);

    socket.on('data', data => {
        readingBuffer = Buffer.concat([readingBuffer, data]);

        let buffer = new createBuffer(readingBuffer);
        let length: any;

        try {
            length = buffer.readletInt();
        } catch (err) {
            return;
        }

        if (readingBuffer.length < length - buffer.offset()) return;

        buffer.readletInt();

        try {
            let end: any = new Date()
            let json = JSON.parse(buffer.readString());
            callback(null, {
                error: false,
                ms: Math.round(end - start),
                version: json.version.name,
                playersConnect: json.players.online,
                playersMax: json.players.max,
                motd: normalizeMotd(json.description)
            });
        } catch (err) {
            return callback(err, null);
        }

        socket.destroy();
    });

    socket.once('error', err => {
        if (callback) callback(err, null);
        socket.destroy();
    });
};

function writePCBuffer(client: any, buffer: any) {
    let length = new createBuffer();
    length.writeletInt(buffer.buffer().length);
    client.write(Buffer.concat([length.buffer(), buffer.buffer()]));
}

export default class status {
    ip: string
    port: number
    constructor(ip = '0.0.0.0', port = 25565) {
        this.ip = ip
        this.port = port
    }

    async getStatus(timeout = 3000) {
        return await new Promise((resolve, reject) => {
            ping(this.ip, this.port, (err: any, res: any) => {
                if (err) return reject({ error: err });
                return resolve(res);
            }, timeout);
        })
    }
}

export function parseServerAddress(serverAddress: string): { host: string, port: number } {
    const address = serverAddress.trim();
    const bracketedHost = address.match(/^\[([^\]]+)\](?::(\d+))?$/);
    const hostWithPort = address.match(/^(.+):(\d+)$/);

    return {
        host: bracketedHost?.[1] || hostWithPort?.[1] || address,
        port: Number(bracketedHost?.[2] || hostWithPort?.[2] || 25565)
    };
}

export async function getServerStatus(serverAddress: string, timeout = 3000) {
    if (typeof serverAddress !== 'string' || !serverAddress.trim()) {
        throw new Error('Invalid server address');
    }

    const { host, port } = parseServerAddress(serverAddress);
    const serverStatus = new status(host, port);
    return serverStatus.getStatus(timeout);
}