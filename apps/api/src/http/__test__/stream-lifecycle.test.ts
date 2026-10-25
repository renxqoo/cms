import { Hono } from 'hono';
import { expect, it } from 'vitest';
import { loadConfig } from '../../bootstrap/load-config.ts';
import type { HttpEnvironment } from '../contract.ts';
import { requestLifecycle } from '../lifecycle.ts';

function fixture(timeout: number) {
  const config = loadConfig({
    DATABASE_URL: 'postgresql:///postgres?host=/tmp',
    CMS_RATE_LIMIT_SECRET: 'stream-lifecycle-isolated-test-secret',
  });
  config.http.maxRequests = 1;
  config.http.requestTimeoutMs = timeout;
  const app = new Hono<HttpEnvironment>();
  let cancelled = false;
  app.use('*', requestLifecycle(config.http, { admitIp: () => Promise.resolve() }));
  app.get('/stream', (c) => {
    c.set('streaming', true);
    return new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
    );
  });
  app.get('/livez', () => new Response('alive'));
  return { app, cancelled: () => cancelled };
}

it('slow downloads hold admission capacity until the client cancels their stream', async () => {
  const kit = fixture(1000);
  const response = await kit.app.request('http://localhost/stream');
  expect(response.status).toBe(200);
  expect((await kit.app.request('http://localhost/livez')).status).toBe(503);
  await response.body?.cancel();
  expect(kit.cancelled()).toBe(true);
  expect((await kit.app.request('http://localhost/livez')).status).toBe(200);
});

it('a response deadline cancels storage reads after headers have already been returned', async () => {
  const kit = fixture(30);
  const response = await kit.app.request('http://localhost/stream');
  const reader = response.body?.getReader();
  await expect(reader?.read()).rejects.toBeDefined();
  expect(kit.cancelled()).toBe(true);
  expect((await kit.app.request('http://localhost/livez')).status).toBe(200);
});
