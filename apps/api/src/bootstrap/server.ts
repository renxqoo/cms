import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { getRequestListener } from '@hono/node-server';
import type { ApplicationRuntime } from './create-runtime.ts';
import type { ApplicationConfig } from './load-config.ts';
import { startMaintenance } from './maintenance.ts';

export async function startServer(runtime: ApplicationRuntime, config: ApplicationConfig['http']) {
  await runtime.ready();
  const listener = getRequestListener(runtime.app.fetch);
  const server = createServer({ maxHeaderSize: config.headerLimitBytes }, (request, response) => {
    void listener(request, response).catch(() => {
      response.destroy();
    });
  });
  server.requestTimeout = config.uploadTimeoutMs;
  server.headersTimeout = config.requestTimeoutMs;
  server.maxConnections = config.maxRequests;
  server.on('clientError', (_error, socket) => {
    process.stderr.write(
      `${JSON.stringify({ connectionId: randomUUID(), event: 'invalid_http' })}\n`,
    );
    if (socket.writable)
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, config.host, () => {
      server.off('error', reject);
      resolve();
    });
  });
  const stopMaintenance = startMaintenance(runtime);
  async function close(): Promise<void> {
    runtime.stop();
    await stopMaintenance();
    const timer = setTimeout(() => server.closeAllConnections(), config.shutdownTimeoutMs);
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    clearTimeout(timer);
    await runtime.close();
  }
  return { server, close };
}
