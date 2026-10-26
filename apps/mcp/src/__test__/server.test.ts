import { afterEach, expect, it, vi } from 'vitest';
import { request } from 'node:http';
import { loadMcpConfig } from '../config.ts';
import { startMcpServer } from '../server.ts';

const realFetch = fetch;
const servers: Awaited<ReturnType<typeof startMcpServer>>[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const server of servers.splice(0)) await server.close();
});
const config = loadMcpConfig({
  CMS_API_ORIGIN: 'http://127.0.0.1:3001',
  CMS_MCP_RESOURCE: 'http://127.0.0.1:3002/mcp',
  CMS_MCP_BRIDGE_SECRET: 's'.repeat(32),
  MCP_PORT: '0',
  MCP_REQUEST_TIMEOUT_MS: '500',
  MCP_SHUTDOWN_TIMEOUT_MS: '20',
});
async function start(options = {}) {
  const server = await startMcpServer({ ...config, ...options });
  servers.push(server);
  return `http://127.0.0.1:${server.port}`;
}

it('serves public health and metadata, validates Host and releases admission capacity after each response', async () => {
  const origin = await start({ concurrency: 1 });
  for (let count = 0; count < 3; count++)
    expect((await realFetch(`${origin}/healthz`)).status).toBe(200);
  expect((await realFetch(`${origin}/.well-known/oauth-protected-resource`)).status).toBe(200);
  expect((await realFetch(`${origin}/healthz`, { headers: { host: 'evil.example' } })).status).toBe(
    403,
  );
});

it('rejects body and instance memory budgets before reading the entire request', async () => {
  const limited = await start({ bodyLimitBytes: 8 });
  expect((await realFetch(`${limited}/mcp`, { method: 'POST', body: '123456789' })).status).toBe(
    413,
  );
  const noBudget = await start({ inFlightBytes: 1 });
  expect((await realFetch(`${noBudget}/mcp`, { method: 'POST', body: '{}' })).status).toBe(503);
});

it('caps concurrent requests and gracefully aborts an upstream that cannot drain', async () => {
  const started = Promise.withResolvers<void>();
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          started.resolve();
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new Error('aborted'));
            },
            { once: true },
          );
        }),
    ),
  );
  const origin = await start({ concurrency: 1 });
  const inFlight = realFetch(`${origin}/mcp`, {
    method: 'POST',
    headers: { authorization: 'Bearer key' },
    body: '{}',
  }).catch((error: unknown) => error);
  await started.promise;
  expect((await realFetch(`${origin}/mcp`, { method: 'POST', body: '{}' })).status).toBe(503);
  const server = servers.at(-1);
  await server?.close();
  expect(await inFlight).toBeInstanceOf(Error);
  await server?.close();
});

it('validates external resource shape, origin protocols and bridge secret length', () => {
  expect(() =>
    loadMcpConfig({
      CMS_API_ORIGIN: 'https://api.example',
      CMS_MCP_RESOURCE: 'https://mcp.example/path',
      CMS_MCP_BRIDGE_SECRET: 'x'.repeat(32),
    }),
  ).toThrow('/mcp');
  expect(() =>
    loadMcpConfig({
      CMS_API_ORIGIN: 'http://api.example',
      CMS_MCP_RESOURCE: 'https://mcp.example/mcp',
      CMS_MCP_BRIDGE_SECRET: 'x'.repeat(32),
    }),
  ).toThrow('HTTPS');
  expect(() =>
    loadMcpConfig({
      CMS_API_ORIGIN: 'https://api.example',
      CMS_MCP_RESOURCE: 'https://mcp.example/mcp',
      CMS_MCP_BRIDGE_SECRET: 'short',
    }),
  ).toThrow('32');
});

it('rejects a malformed Content-Length without admitting request work', async () => {
  const origin = new URL(await start());
  const status = await new Promise<number>((resolve, reject) => {
    const outgoing = request(
      {
        hostname: origin.hostname,
        port: origin.port,
        path: '/mcp',
        method: 'POST',
        headers: { 'content-length': 'invalid' },
      },
      (incoming) => {
        incoming.resume();
        resolve(incoming.statusCode ?? 0);
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
  expect(status).toBe(400);
});
