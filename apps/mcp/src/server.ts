import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { hostHeaderValidation, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpApplication } from './handler.ts';
import type { McpConfig } from './config.ts';

function reservation(request: IncomingMessage, config: McpConfig): number | null {
  const length = request.headers['content-length'];
  if (length === undefined) return config.bodyLimitBytes + config.responseLimitBytes;
  if (typeof length !== 'string' || !/^\d+$/.test(length)) return null;
  const bytes = Number(length);
  if (!Number.isSafeInteger(bytes) || bytes > config.bodyLimitBytes) return null;
  return bytes + config.responseLimitBytes;
}

function reject(response: ServerResponse, status: number): void {
  response.writeHead(status, { 'content-type': 'application/json', connection: 'close' });
  response.end(
    JSON.stringify({ error: status === 413 ? 'payload_too_large' : 'temporarily_unavailable' }),
  );
}

function admission(config: McpConfig) {
  let active = 0;
  let bytes = 0;
  return (request: IncomingMessage, response: ServerResponse) => {
    const size = reservation(request, config);
    if (size === null) {
      reject(response, 413);
      return false;
    }
    if (active >= config.concurrency || bytes + size > config.inFlightBytes) {
      reject(response, 503);
      return false;
    }
    active++;
    bytes += size;
    let released = false;
    const timer = setTimeout(
      () => response.destroy(new Error('MCP request timed out')),
      config.requestTimeoutMs,
    );
    function release() {
      if (released) return;
      released = true;
      clearTimeout(timer);
      active--;
      bytes -= size ?? 0;
      response.off('finish', release);
      response.off('close', release);
    }
    response.once('finish', release);
    response.once('close', release);
    return true;
  };
}

export async function startMcpServer(config: McpConfig) {
  const app = createMcpApplication(config);
  const handle = toNodeHandler(app, { maxRequestBodySize: config.bodyLimitBytes });
  const hostAllowed = hostHeaderValidation(config.allowedHosts);
  const admit = admission(config);
  const server = createServer({ maxHeaderSize: config.headerLimitBytes }, (request, response) => {
    if (!hostAllowed(request, response) || !admit(request, response)) return;
    void handle(
      {
        headers: request.headers,
        method: request.method ?? 'GET',
        url: request.url ?? '/',
        [Symbol.asyncIterator]: () => request[Symbol.asyncIterator](),
      },
      response,
    ).catch(() => {
      if (!response.destroyed) response.destroy();
    });
  });
  server.headersTimeout = config.requestTimeoutMs;
  server.requestTimeout = config.requestTimeoutMs;
  await new Promise<void>((resolve, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(config.port, config.host, () => {
      server.off('error', rejectListen);
      resolve();
    });
  });
  let closing: Promise<void> | undefined;
  function close(): Promise<void> {
    closing ??= new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        server.closeAllConnections();
        void app.close();
      }, config.shutdownTimeoutMs);
      server.close(() => {
        clearTimeout(timer);
        void app.close().then(resolve);
      });
      server.closeIdleConnections();
    });
    return closing;
  }
  const address = server.address();
  if (address === null || typeof address === 'string')
    throw new Error('MCP server has no TCP address');
  return { port: address.port, close };
}
