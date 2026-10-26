import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { api, createHttpFixture, errorCode, mailToken } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('rejects query parameters that collide with a resource path ID', async () => {
  fixture = await createHttpFixture();
  const response = await api(fixture)(
    'GET',
    `/v1/admins/${fixture.admin.id}?id=00000000-0000-4000-8000-000000000001`,
  );
  expect(response.status).toBe(400);
});

it('keeps CORS origin and Vary on both successful and failed actual responses', async () => {
  fixture = await createHttpFixture();
  fixture.config.http.allowedOrigins.push('https://cms.example.test');
  for (const token of [fixture.token, 'invalid']) {
    const response = await fixture.runtime.app.request('http://localhost/v1/me', {
      headers: { origin: 'https://cms.example.test', authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(token === fixture.token ? 200 : 401);
    expect(response.headers.get('access-control-allow-origin')).toBe('https://cms.example.test');
    expect(response.headers.get('vary')).toContain('Origin');
  }
});

it('keeps no-store and request IDs on successful pagination and rejects unauthenticated malformed JSON', async () => {
  fixture = await createHttpFixture();
  const response = await api(fixture)('GET', '/v1/admins?page=1&pageSize=1');
  expect(response.status).toBe(200);
  expect(
    z
      .object({ total: z.number(), rows: z.array(z.object({ email: z.string() })) })
      .parse(await response.json()),
  ).toMatchObject({ total: 1, rows: [{ email: 'owner@example.test' }] });
  const malformed = await fixture.runtime.app.request('http://localhost/v1/roles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  expect(malformed.status).toBe(401);
  expect(await errorCode(malformed)).toBe('unauthenticated');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
});

it('creates an invited editor through SMTP, grants reading, and applies revocation on the next request', async () => {
  fixture = await createHttpFixture();
  const permissions = z
    .object({ rows: z.array(z.object({ id: z.uuid(), code: z.string() })) })
    .parse(await (await api(fixture)('GET', '/v1/permissions')).json());
  const read = permissions.rows.find((row) => row.code === 'admins:read');
  if (!read) throw new Error('Expected seeded admin read permission');
  const roleResponse = await api(fixture)('POST', '/v1/roles', {
    body: { code: 'reader', name: 'Reader', permissionIds: [read.id] },
  });
  expect(roleResponse.status).toBe(201);
  const role = z.object({ id: z.uuid(), version: z.number() }).parse(await roleResponse.json());
  const accountResponse = await api(fixture)('POST', '/v1/admins', {
    body: { email: 'editor@example.test', roleId: role.id },
  });
  expect(accountResponse.status).toBe(201);
  const raw = await fixture.smtp.waitForMessage();
  const activation = await api(fixture)('POST', '/v1/auth/invitation-acceptances', {
    token: null,
    body: { token: mailToken(raw), newPassword: 'Editor safe password 2026' },
  });
  expect(activation.status).toBe(204);
  const login = await api(fixture)('POST', '/v1/auth/login', {
    token: null,
    body: { email: 'editor@example.test', password: 'Editor safe password 2026' },
  });
  const editor = z.object({ token: z.string() }).parse(await login.json());
  expect((await api(fixture)('GET', '/v1/admins', { token: editor.token })).status).toBe(200);
  expect(
    (
      await api(fixture)('POST', '/v1/roles', {
        token: editor.token,
        body: { code: 'rogue', name: 'Rogue' },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await api(fixture)('PUT', `/v1/roles/${role.id}/permissions`, {
        body: { version: role.version, permissionIds: [] },
      })
    ).status,
  ).toBe(200);
  expect((await api(fixture)('GET', '/v1/admins', { token: editor.token })).status).toBe(403);
  expect((await api(fixture)('POST', '/v1/auth/logout', { token: editor.token })).status).toBe(204);
  expect((await api(fixture)('GET', '/v1/me', { token: editor.token })).status).toBe(401);
});

it('rejects unknown prototype query keys and enforces protocol, HEAD and strict body rules', async () => {
  fixture = await createHttpFixture();
  expect((await api(fixture)('HEAD', '/v1/admins', { token: null })).status).toBe(401);
  expect((await api(fixture)('HEAD', '/v1/admins')).status).toBe(200);
  expect((await api(fixture)('GET', '/v1/admins?page=1&page=2')).status).toBe(400);
  expect((await api(fixture)('GET', '/v1/admins?__proto__=unexpected')).status).toBe(400);
  expect((await api(fixture)('GET', '/v1/me/fake')).status).toBe(404);
  const unknown = await api(fixture)('POST', '/v1/roles', {
    body: { code: 'extra', name: 'Extra', isSuper: true },
  });
  expect(await errorCode(unknown)).toBe('invalid_input');
  const wrongType = await fixture.runtime.app.request('http://localhost/v1/roles', {
    method: 'POST',
    headers: { authorization: `Bearer ${fixture.token}`, 'content-type': 'text/plain' },
    body: '{}',
  });
  expect(wrongType.status).toBe(415);
  const requestId = await fixture.runtime.app.request('http://localhost/livez', {
    headers: { 'x-request-id': 'attacker-controlled' },
  });
  expect(requestId.headers.get('x-request-id')).not.toBe('attacker-controlled');
  const forbiddenHost = await fixture.runtime.app.request('http://attacker.test/livez');
  expect(forbiddenHost.status).toBe(403);
  expect(forbiddenHost.headers.get('cache-control')).toBe('no-store');
  expect(forbiddenHost.headers.get('x-content-type-options')).toBe('nosniff');
});

it('documents all registered business operations and protects production API descriptions', async () => {
  fixture = await createHttpFixture();
  expect((await api(fixture)('GET', '/openapi.json', { token: null })).status).toBe(401);
  const response = await api(fixture)('GET', '/openapi.json');
  expect(response.status).toBe(200);
  const document = z
    .object({
      paths: z.record(z.string(), z.record(z.string(), z.object({ operationId: z.string() }))),
      components: z.object({ schemas: z.record(z.string(), z.unknown()) }),
    })
    .parse(await response.json());
  const ids = Object.values(document.paths).flatMap((methods) =>
    Object.values(methods).map((operation) => operation.operationId),
  );
  expect(ids).toHaveLength(82);
  expect(new Set(ids).size).toBe(82);
  expect(ids).toContain('identity.resetPassword');
  expect(ids).toContain('endpoints.updateBinding');
  expect(ids).toContain('documents.publish');
  expect(ids).toContain('content.getJob');
  expect(ids).toContain('assets.downloadBinding');
  expect(document.components.schemas.Admin).toBeDefined();
});
