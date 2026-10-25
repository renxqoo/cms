import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { Hono } from 'hono';
import { requestLifecycle } from '../lifecycle.ts';
import type { HttpEnvironment } from '../contract.ts';
import { loadConfig } from '../../bootstrap/load-config.ts';
import { api, administratorPassword, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  vi.restoreAllMocks();
  await fixture?.close();
  fixture = undefined;
});

const logSchema = z.object({
  requestId: z.uuid(),
  operationId: z.string().nullable(),
  path: z.string().nullable(),
  actorId: z.uuid().nullable(),
  method: z.string(),
  status: z.number(),
  durationMs: z.number().nonnegative(),
  ip: z.string(),
});

function captureLogs() {
  const lines: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
    return true;
  });
  return {
    record(response: Response) {
      const records = lines
        .flatMap((line) => line.trim().split('\n'))
        .map((line) => {
          const value: unknown = JSON.parse(line);
          return logSchema.parse(value);
        });
      const found = records.find(
        (record) => record.requestId === response.headers.get('x-request-id'),
      );
      if (!found) throw new Error('Expected a correlated access log');
      return found;
    },
    text: () => lines.join(''),
  };
}

it.each(['parameter', 'static'] as const)(
  'logs the responding route when %s is registered before an overlapping route',
  async (first) => {
    const app = new Hono<HttpEnvironment>();
    const config = loadConfig({
      DATABASE_URL: 'postgresql:///postgres?host=/tmp',
      CMS_RATE_LIMIT_SECRET: 'a-route-only-test-secret-not-used-for-io',
    });
    const routes = { parameter: '/items/:id', static: '/items/self' };
    const order =
      first === 'parameter'
        ? (['parameter', 'static'] as const)
        : (['static', 'parameter'] as const);
    const operations = order.map((name) => ({
      id: `probe.${name}`,
      module: 'probe',
      method: 'GET' as const,
      path: routes[name],
      access: 'public' as const,
      scopeKind: 'global' as const,
      bindingConfigurable: false,
    }));
    app.use('*', requestLifecycle(config.http, { admitIp: () => Promise.resolve() }, operations));
    for (const name of order) app.get(routes[name], (c) => c.text(name));
    const logs = captureLogs();
    const response = await app.request('http://localhost/items/self');
    expect(await response.text()).toBe(first);
    expect(logs.record(response)).toMatchObject({
      operationId: `probe.${first}`,
      path: routes[first],
    });
  },
);

it('keeps GET and HEAD liveness independent of a failed shared rate-limit store', async () => {
  fixture = await createHttpFixture();
  expect((await api(fixture)('GET', '/livez')).status).toBe(200);
  const logs = captureLogs();
  await fixture.store.database.query('DROP TABLE rate_limit_buckets');
  for (const method of ['GET', 'HEAD']) {
    const response = await api(fixture)(method, '/livez');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
  }
  const readiness = await api(fixture)('GET', '/readyz');
  expect(readiness.status).toBe(503);
  expect(logs.record(readiness)).toMatchObject({ operationId: null, path: '/readyz' });
  const dependent = await api(fixture)('GET', '/v1/me');
  expect(dependent.status).toBe(503);
  expect(logs.record(dependent)).toMatchObject({
    operationId: 'access.me',
    path: '/v1/me',
    actorId: null,
  });
  expect((await api(fixture)('POST', '/livez')).status).toBe(503);
  expect((await api(fixture)('GET', '/livez/extra')).status).toBe(503);
});

it('logs the matched operation, normalized route and verified actor on success and authorization denial', async () => {
  fixture = await createHttpFixture();
  const logs = captureLogs();
  const path = `/v1/admins/${fixture.admin.id}`;
  const success = await api(fixture)('GET', path);
  expect(success.status).toBe(200);
  expect(logs.record(success)).toMatchObject({
    operationId: 'admins.get',
    path: '/v1/admins/:id',
    actorId: fixture.admin.id,
    method: 'GET',
    status: 200,
  });
  const ctx = { requestId: randomUUID(), ip: '127.0.0.1', token: fixture.token };
  const directory = await fixture.runtime.access.api.listEndpoints(ctx, { pageSize: 100 });
  const binding = directory.rows.find((entry) => entry.operationId === 'admins.get')?.binding;
  if (!binding) throw new Error('Expected an admin read binding');
  await fixture.runtime.access.api.deleteBinding(ctx, { id: binding.id, version: binding.version });
  const denied = await api(fixture)('GET', path);
  expect(denied.status).toBe(403);
  expect(logs.record(denied)).toMatchObject({
    operationId: 'admins.get',
    actorId: fixture.admin.id,
    status: 403,
  });
  const unauthenticated = await fixture.runtime.app.request(`http://localhost${path}`, {
    headers: { authorization: 'Bearer forged-private-token', 'x-actor-id': fixture.admin.id },
  });
  expect(unauthenticated.status).toBe(401);
  expect(logs.record(unauthenticated)).toMatchObject({ operationId: 'admins.get', actorId: null });
  const unknown = await api(fixture)('GET', '/unknown-private-path?token=private-query-token');
  expect(unknown.status).toBe(404);
  expect(logs.record(unknown)).toMatchObject({ operationId: null, path: null, actorId: null });
  expect(logs.text()).not.toContain(fixture.token);
  expect(logs.text()).not.toContain('forged-private-token');
  expect(logs.text()).not.toContain('unknown-private-path');
  expect(logs.text()).not.toContain('private-query-token');
});

it('records actors only after successful password or live-session authentication', async () => {
  fixture = await createHttpFixture();
  const logs = captureLogs();
  const rejected = await api(fixture)('POST', '/v1/auth/login', {
    token: null,
    body: { email: fixture.admin.email, password: 'wrong-private-password' },
  });
  expect(rejected.status).toBe(401);
  expect(logs.record(rejected)).toMatchObject({ operationId: 'identity.login', actorId: null });
  const login = await api(fixture)('POST', '/v1/auth/login', {
    token: null,
    body: { email: fixture.admin.email, password: administratorPassword },
  });
  expect(login.status).toBe(200);
  expect(logs.record(login)).toMatchObject({
    operationId: 'identity.login',
    actorId: fixture.admin.id,
  });
  const result = z.object({ token: z.string() }).parse(await login.json());
  const logout = await api(fixture)('POST', '/v1/auth/logout', result);
  expect(logout.status).toBe(204);
  expect(logs.record(logout)).toMatchObject({
    operationId: 'identity.logout',
    actorId: fixture.admin.id,
  });
  const repeated = await api(fixture)('POST', '/v1/auth/logout', result);
  expect(repeated.status).toBe(204);
  expect(logs.record(repeated)).toMatchObject({ operationId: 'identity.logout', actorId: null });
  expect(logs.text()).not.toContain(result.token);
  expect(logs.text()).not.toContain(administratorPassword);
  expect(logs.text()).not.toContain(fixture.admin.email);
});
