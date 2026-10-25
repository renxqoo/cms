import { createServer } from 'node:net';
import type { Socket } from 'node:net';

export async function smtpServer(mode: 'accepted' | 'rejected' | 'unknown' | 'stall' = 'accepted') {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    if (mode === 'stall') return;
    socket.write('220 localhost test SMTP\r\n');
    let buffer = '';
    let data = false;
    let message = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const boundary = buffer.indexOf('\r\n');
        const line = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (data && line !== '.') {
          message += `${line}\r\n`;
          continue;
        }
        if (data) {
          data = false;
          messages.push(message);
          if (mode === 'unknown') socket.destroy();
          else socket.write('250 message accepted\r\n');
        } else if (/^(EHLO|HELO)/.test(line)) socket.write('250 localhost\r\n');
        else if (line.startsWith('RCPT') && mode === 'rejected')
          socket.write('550 recipient rejected\r\n');
        else if (line === 'DATA') {
          data = true;
          socket.write('354 continue\r\n');
        } else if (line === 'QUIT') socket.end('221 closing\r\n');
        else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('SMTP server did not bind');
  return {
    port: address.port,
    messages,
    sockets,
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
