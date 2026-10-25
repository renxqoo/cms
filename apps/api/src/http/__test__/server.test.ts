import { connect } from 'node:net';
import { afterEach, expect, it } from 'vitest';
import { startServer } from '../../bootstrap/server.ts';
import { createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
let running: Awaited<ReturnType<typeof startServer>> | undefined;
afterEach(async () => {
  await running?.close();
  running = undefined;
  await fixture?.close();
  fixture = undefined;
});

function portOf(server: Awaited<ReturnType<typeof startServer>>): number {
  const address = server.server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP listener');
  return address.port;
}

async function waitUntil(check: () => Promise<boolean>): Promise<void> {
  const end = Date.now() + 2000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error('Expected state did not converge');
}

function partialRequest(port: number, payload: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1');
    let data = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Response timed out'));
    }, 3000);
    socket.once('connect', () => socket.write(payload));
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      const match = /^HTTP\/1\.1 (\d{3})/.exec(data);
      if (match?.[1]) {
        clearTimeout(timer);
        resolve(Number(match[1]));
        socket.destroy();
      }
    });
  });
}

it('runs real network health checks and reclaims maintenance records before closing all resources', async () => {
  fixture = await createHttpFixture();
  fixture.runtime.maintenanceIntervalMs = 10;
  await fixture.store.database.query(
    "INSERT INTO rate_limit_buckets(key,count,expires_at) VALUES('expired-test',1,clock_timestamp()-interval '1 second')",
  );
  running = await startServer(fixture.runtime, { ...fixture.config.http, port: 0 });
  const port = portOf(running);
  expect((await fetch(`http://127.0.0.1:${port}/livez`)).status).toBe(200);
  expect((await fetch(`http://127.0.0.1:${port}/readyz`)).status).toBe(200);
  await waitUntil(
    async () =>
      (
        await fixture?.store.database.query(
          "SELECT key FROM rate_limit_buckets WHERE key='expired-test'",
        )
      )?.rowCount === 0,
  );
  await running.close();
  running = undefined;
  await expect(fixture.runtime.ready()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await expect(fixture.runtime.close()).resolves.toBeUndefined();
});

it('cancels an incomplete JSON request at the deadline and restores request admission capacity', async () => {
  fixture = await createHttpFixture();
  fixture.config.http.requestTimeoutMs = 80;
  fixture.config.http.maxRequests = 1;
  running = await startServer(fixture.runtime, { ...fixture.config.http, port: 0 });
  const port = portOf(running);
  const status = await partialRequest(
    port,
    'POST /v1/auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{',
  );
  expect(status).toBe(503);
  await waitUntil(async () => (await fetch(`http://127.0.0.1:${port}/livez`)).status === 200);
});

it('rejects oversized headers at the Node parser without exposing the supplied header value', async () => {
  fixture = await createHttpFixture();
  running = await startServer(fixture.runtime, { ...fixture.config.http, port: 0 });
  const status = await partialRequest(
    portOf(running),
    `GET /livez HTTP/1.1\r\nHost: localhost\r\nX-Large: ${'x'.repeat(20000)}\r\n\r\n`,
  );
  expect(status).toBe(400);
});
