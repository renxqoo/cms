import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { handleCmsRequest } from '../bff';
import { httpFixture, incomingBody, sendJson } from './support';

let fixture: Awaited<ReturnType<typeof httpFixture>>;
let payload: unknown;
let status: number;
let observed: { path: string; authorization: string | undefined; body: string }[];
const origin = 'http://localhost:3000';
const credential = {
  id: '10000000-0000-4000-8000-000000000001',
  kind: 'api_key',
  name: 'Test key',
  prefix: 'cms_key_prefix',
  clientId: null,
  clientName: null,
  resource: 'mcp',
  grants: [{ operationId: 'documents.get', scopeKind: 'collection', collectionKey: 'articles' }],
  createdAt: '2026-10-27T00:00:00.000Z',
  expiresAt: '2026-11-27T00:00:00.000Z',
  revokedAt: null,
  lastUsedAt: null,
  status: 'active',
};
function request(
  path: string,
  options: { method?: string; body?: unknown; origin?: string; cookie?: string } = {},
) {
  return new Request(`${origin}/api/cms${path}`, {
    method: options.method ?? 'GET',
    headers: {
      origin: options.origin ?? origin,
      cookie: options.cookie ?? 'oneaster-session=session-secret',
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

beforeAll(async () => {
  fixture = await httpFixture(async (req, res) => {
    observed.push({
      path: req.url ?? '',
      authorization: req.headers.authorization,
      body: await incomingBody(req),
    });
    if (status === 204) {
      res.writeHead(204);
      res.end();
      return;
    }
    sendJson(res, payload, status);
  });
  vi.stubEnv('CMS_API_BASE_URL', fixture.origin);
  vi.stubEnv('CMS_ADMIN_ORIGIN', origin);
});
afterAll(async () => {
  await fixture.close();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  observed = [];
  status = 200;
  payload = {};
});

it('projects list records without a retrievable API key, browser token or refresh token', async () => {
  payload = {
    rows: [
      {
        ...credential,
        apiKey: 'must-not-return',
        token: 'browser-secret',
        refresh_token: 'refresh-secret',
      },
    ],
    total: 1,
    page: 2,
    pageSize: 20,
    token: 'other-secret',
  };
  const response = await handleCmsRequest(
    request('/v1/me/credentials?page=2&pageSize=20&kind=api_key'),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ rows: [credential], total: 1, page: 2, pageSize: 20 });
  expect(observed[0]?.authorization).toBe('Bearer session-secret');
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('set-cookie')).toBeNull();
});

it('permits a one-time API key only in the create response and never forwards refresh tokens', async () => {
  status = 201;
  payload = {
    credential,
    apiKey: 'one-time-key',
    token: 'browser-secret',
    refresh_token: 'refresh-secret',
  };
  const response = await handleCmsRequest(
    request('/v1/me/api-keys', {
      method: 'POST',
      body: { name: 'Test key', expiresAt: credential.expiresAt, grants: credential.grants },
    }),
  );
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ credential, apiKey: 'one-time-key' });
  expect(JSON.parse(observed[0]?.body ?? '{}')).toEqual({
    name: 'Test key',
    expiresAt: credential.expiresAt,
    grants: credential.grants,
  });
});

it('reads and decides authorization through the protected BFF while stripping upstream tokens', async () => {
  const authorization = {
    id: 'opaque-request',
    clientId: 'cms-cli',
    clientName: 'CMS CLI',
    redirectUri: 'http://127.0.0.1:45832/callback',
    resource: 'https://cms.example.test',
    scopes: ['cms'],
    expiresAt: credential.expiresAt,
    availableGrants: credential.grants,
  };
  payload = { ...authorization, token: 'browser-secret', refresh_token: 'refresh-secret' };
  const read = await handleCmsRequest(request('/v1/oauth/requests/opaque-request'));
  expect(await read.json()).toEqual(authorization);
  payload = {
    redirectTo: 'http://127.0.0.1:45832/callback?code=code&state=state',
    refresh_token: 'refresh-secret',
  };
  const decision = await handleCmsRequest(
    request('/v1/oauth/requests/opaque-request/decisions', {
      method: 'POST',
      body: { approved: false, grants: [] },
    }),
  );
  expect(await decision.json()).toEqual({
    redirectTo: 'http://127.0.0.1:45832/callback?code=code&state=state',
  });
  expect(observed.map((entry) => entry.authorization)).toEqual([
    'Bearer session-secret',
    'Bearer session-secret',
  ]);
});

it('keeps both revocations protected and requires the configured Origin for every mutation', async () => {
  const crossSite = await handleCmsRequest(
    request('/v1/me/credentials/key-id', { method: 'DELETE', origin: 'https://attacker.example' }),
  );
  expect(crossSite.status).toBe(403);
  const anonymous = await handleCmsRequest(
    request('/v1/oauth/requests/opaque-request', { cookie: '' }),
  );
  expect(anonymous.status).toBe(401);
  expect(observed).toHaveLength(0);
  status = 204;
  expect(
    (await handleCmsRequest(request('/v1/me/credentials/key-id', { method: 'DELETE' }))).status,
  ).toBe(204);
  status = 200;
  payload = { revoked: 3, token: 'browser-secret' };
  const all = await handleCmsRequest(
    request('/v1/me/oauth-clients/cms-cli/revocations', { method: 'POST', body: {} }),
  );
  expect(await all.json()).toEqual({ revoked: 3 });
});

it('rejects malformed credential responses and token query parameters without forwarding them', async () => {
  payload = { apiKey: 'only-secret' };
  const response = await handleCmsRequest(request('/v1/me/credentials'));
  expect(response.status).toBe(503);
  expect(await response.text()).not.toContain('only-secret');
  const invalid = await handleCmsRequest(request('/v1/me/credentials?token=secret'));
  expect(invalid.status).toBe(400);
  expect(observed).toHaveLength(1);
});
