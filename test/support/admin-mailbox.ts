import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import type { Socket } from 'node:net';

export interface AdminMailboxConnection {
  origin: string;
  capability: string;
}

export async function createAdminMailbox(options: {
  messages: readonly string[];
  maximumBytes: number;
}) {
  const capability = randomBytes(32).toString('base64url');
  const sockets = new Set<Socket>();
  const server = createServer((request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.setHeader('content-type', 'application/json');
    if (request.headers.authorization !== `Bearer ${capability}`) {
      response.writeHead(401).end('{}');
    } else if (request.method !== 'GET' || request.url !== '/messages') {
      response.writeHead(404).end('{}');
    } else {
      const body = JSON.stringify({ messages: options.messages });
      if (Buffer.byteLength(body) > options.maximumBytes) response.writeHead(413).end('{}');
      else response.writeHead(200).end(body);
    }
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mailbox listener did not bind.');
  return {
    connection: { origin: `http://127.0.0.1:${address.port}`, capability },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
