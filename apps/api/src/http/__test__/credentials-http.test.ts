import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { api, createHttpFixture, errorCode } from './support.ts';
import type { HttpFixture } from './support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
const readAdmins = { operationId: 'admins.list', scopeKind: 'global', collectionKey: null };

async function bridge(world: HttpFixture, secret: string) {
  const response = await world.runtime.app.request('http://localhost/oauth/exchange', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'x-cms-mcp-secret': world.config.oauth.bridgeSecret,
    },
  });
  expect(response.status).toBe(200);
  return z.object({ access_token: z.string() }).parse(await response.json()).access_token;
}

async function start(world: HttpFixture, options: { name?: string; grants?: unknown[] } = {}) {
  const verifier = 'v'.repeat(64);
  const redirectUri = 'http://127.0.0.1:49236/callback';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: 'cms-cli',
    redirect_uri: redirectUri,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'cms offline_access',
    state: 'independent-state',
    resource: world.config.oauth.issuer,
  });
  const response = await world.runtime.app.request(`http://localhost/oauth/authorize?${params}`);
  expect(response.status).toBe(302);
  const requestId = new URL(response.headers.get('location') ?? '').searchParams.get('request');
  const decision = await api(world)('POST', `/v1/oauth/requests/${requestId}/decisions`, {
    body: {
      approved: true,
      grants: options.grants ?? [readAdmins],
      ...(options.name ? { name: options.name } : {}),
    },
  });
  expect(decision.status).toBe(200);
  const result = z.object({ redirectTo: z.string() }).parse(await decision.json());
  const callback = new URL(result.redirectTo);
  expect(callback.searchParams.get('state')).toBe('independent-state');
  expect(callback.searchParams.get('iss')).toBe(world.config.oauth.issuer);
  const code = callback.searchParams.get('code');
  return { verifier, redirectUri, code: code ?? '' };
}

async function token(world: HttpFixture, params: Record<string, string>) {
  return world.runtime.app.request('http://localhost/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: 'cms-cli', ...params }),
  });
}

async function loginCli(world: HttpFixture, name: string) {
  const request = await start(world, { name });
  const response = await token(world, {
    grant_type: 'authorization_code',
    code: request.code,
    code_verifier: request.verifier,
    redirect_uri: request.redirectUri,
    resource: world.config.oauth.issuer,
  });
  expect(response.status).toBe(200);
  return z
    .object({ access_token: z.string(), refresh_token: z.string() })
    .parse(await response.json());
}

it('limits an Agent API Key to configured resources and rejects it immediately after revocation', async () => {
  fixture = await createHttpFixture();
  const created = await api(fixture)('POST', '/v1/me/api-keys', {
    body: {
      name: 'Read administrators',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      grants: [readAdmins],
    },
  });
  expect(created.status).toBe(201);
  const key = z
    .object({
      apiKey: z.string(),
      credential: z.object({ id: z.uuid(), grants: z.array(z.unknown()) }),
    })
    .parse(await created.json());
  expect(key.credential.grants).toEqual([readAdmins]);
  expect((await api(fixture)('GET', '/v1/admins', { token: key.apiKey })).status).toBe(401);
  const access = await bridge(fixture, key.apiKey);
  expect((await api(fixture)('GET', '/v1/admins', { token: access })).status).toBe(200);
  expect((await api(fixture)('GET', '/v1/roles', { token: access })).status).toBe(403);
  const operations = await api(fixture)('GET', '/v1/me/operations?pageSize=100', { token: access });
  const allowed = z
    .object({ rows: z.array(z.object({ operationId: z.string() })), total: z.number() })
    .parse(await operations.json());
  expect(allowed.rows.map((row) => row.operationId)).toContain('admins.list');
  expect(allowed.rows.map((row) => row.operationId)).not.toContain('roles.list');
  expect(allowed.total).toBe(5);
  const listing = await api(fixture)('GET', '/v1/me/credentials');
  expect(await listing.text()).not.toContain(key.apiKey);
  expect((await api(fixture)('DELETE', `/v1/me/credentials/${key.credential.id}`)).status).toBe(
    204,
  );
  expect((await api(fixture)('GET', '/v1/admins', { token: access })).status).toBe(401);
  const rejected = await fixture.runtime.app.request('http://localhost/oauth/exchange', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key.apiKey}`,
      'x-cms-mcp-secret': fixture.config.oauth.bridgeSecret,
    },
  });
  expect(rejected.status).toBe(400);
});

it('does not issue a Key for unknown operations or mismatched collection scope', async () => {
  fixture = await createHttpFixture();
  for (const grant of [
    { ...readAdmins, operationId: 'missing.operation' },
    { ...readAdmins, scopeKind: 'collection', collectionKey: 'articles' },
  ]) {
    const response = await api(fixture)('POST', '/v1/me/api-keys', {
      body: {
        name: 'Invalid grant',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        grants: [grant],
      },
    });
    expect(response.status).toBe(403);
    expect(await errorCode(response)).toBe('forbidden');
  }
  const rows = z
    .object({ total: z.number() })
    .parse(await (await api(fixture)('GET', '/v1/me/credentials')).json());
  expect(rows.total).toBe(0);
});

it('commits refresh-family revocation before returning a replay error', async () => {
  fixture = await createHttpFixture();
  const initial = await loginCli(fixture, 'Laptop');
  expect((await api(fixture)('GET', '/v1/admins', { token: initial.access_token })).status).toBe(
    200,
  );
  const renewed = await token(fixture, {
    grant_type: 'refresh_token',
    refresh_token: initial.refresh_token,
    resource: fixture.config.oauth.issuer,
  });
  expect(renewed.status).toBe(200);
  const next = z
    .object({ access_token: z.string(), refresh_token: z.string() })
    .parse(await renewed.json());
  const replay = await token(fixture, {
    grant_type: 'refresh_token',
    refresh_token: initial.refresh_token,
  });
  expect(replay.status).toBe(400);
  expect(await replay.json()).toMatchObject({ error: 'invalid_grant' });
  expect((await api(fixture)('GET', '/v1/admins', { token: next.access_token })).status).toBe(401);
  expect(
    (await token(fixture, { grant_type: 'refresh_token', refresh_token: next.refresh_token }))
      .status,
  ).toBe(400);
});

it('revokes one CLI login without affecting another device and can revoke the whole application', async () => {
  fixture = await createHttpFixture();
  const first = await loginCli(fixture, 'First device');
  const second = await loginCli(fixture, 'Second device');
  const listing = z
    .object({ rows: z.array(z.object({ id: z.uuid(), name: z.string() })) })
    .parse(await (await api(fixture)('GET', '/v1/me/credentials?kind=oauth')).json());
  const current = listing.rows.find((row) => row.name === 'First device');
  expect(current).toBeDefined();
  expect((await api(fixture)('DELETE', `/v1/me/credentials/${current?.id}`)).status).toBe(204);
  expect((await api(fixture)('GET', '/v1/admins', { token: first.access_token })).status).toBe(401);
  expect((await api(fixture)('GET', '/v1/admins', { token: second.access_token })).status).toBe(
    200,
  );
  expect(
    (await api(fixture)('POST', '/v1/me/oauth-clients/cms-cli/revocations', { body: {} })).status,
  ).toBe(200);
  expect((await api(fixture)('GET', '/v1/admins', { token: second.access_token })).status).toBe(
    401,
  );
});

it('does not let a read-only delegated token bypass the logout operation ceiling', async () => {
  fixture = await createHttpFixture();
  const created = await api(fixture)('POST', '/v1/me/api-keys', {
    body: {
      name: 'Read-only agent',
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      grants: [readAdmins],
    },
  });
  const { apiKey } = z.object({ apiKey: z.string() }).parse(await created.json());
  const access = await bridge(fixture, apiKey);
  const denied = await api(fixture)('POST', '/v1/auth/logout', { token: access, body: {} });
  expect(denied.status).toBe(403);
  expect((await api(fixture)('GET', '/v1/admins', { token: access })).status).toBe(200);
});

it('does not let sibling API keys evade the shared account OAuth issuance rate', async () => {
  fixture = await createHttpFixture();
  const secrets: string[] = [];
  for (const name of ['First agent', 'Second agent']) {
    const response = await api(fixture)('POST', '/v1/me/api-keys', {
      body: {
        name,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        grants: [readAdmins],
      },
    });
    secrets.push(z.object({ apiKey: z.string() }).parse(await response.json()).apiKey);
  }
  fixture.config.policy.userRateLimit = 1;
  const responses: Response[] = [];
  for (const secret of secrets)
    responses.push(
      await fixture.runtime.app.request('http://localhost/oauth/exchange', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secret}`,
          'x-cms-mcp-secret': fixture.config.oauth.bridgeSecret,
        },
      }),
    );
  expect(responses.map((response) => response.status)).toEqual([200, 429]);
  expect(await responses[1]?.json()).toMatchObject({ error: 'temporarily_unavailable' });
});
