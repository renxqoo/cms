import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { api, createHttpFixture } from './support.ts';
import type { HttpFixture } from './support.ts';
import {
  authorizationParameters,
  authorizationCode,
  oauthVerifier,
  cliRedirect,
  protocolToken,
  cliTokens,
} from './oauth-support.ts';

let world: HttpFixture | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

it.each(
  (
    [
      ['application/json', '{}', undefined, 415],
      ['application/x-www-form-urlencoded', 'client_id=cms-cli&client_id=other', undefined, 400],
      ['application/x-www-form-urlencoded', 'client_id=cms-cli&grant_type=unknown', undefined, 400],
      [
        'application/x-www-form-urlencoded',
        'client_id=cms-cli&grant_type=authorization_code',
        'gzip',
        415,
      ],
      ['application/x-www-form-urlencoded', 'x='.padEnd(65_537, 'x'), undefined, 413],
    ] as const
  ).map(([contentType, body, encoding, status]) => ({ contentType, body, encoding, status })),
)(
  'rejects invalid protocol bodies ($contentType)',
  async ({ contentType, body, encoding, status }) => {
    world = await createHttpFixture();
    const response = await world.runtime.app.request('http://localhost/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': contentType,
        ...(encoding ? { 'content-encoding': encoding } : {}),
      },
      body,
    });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      error: body.includes('grant_type=unknown') ? 'unsupported_grant_type' : 'invalid_request',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  },
);

it.each([
  '{"broken":',
  '{"extensions":{"value":1,"value":2},"redirect_uris":["https://client.example/cb"]}',
])('rejects malformed or nested duplicate registration members', async (body) => {
  world = await createHttpFixture();
  const response = await world.runtime.app.request('http://localhost/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  expect(response.status).toBe(400);
  expect((await world.store.database.query('SELECT id FROM oauth_clients')).rowCount).toBe(0);
});

it('rejects Basic credentials and client secrets for the public OAuth token client', async () => {
  world = await createHttpFixture();
  const basic = await world.runtime.app.request('http://localhost/oauth/token', {
    method: 'POST',
    headers: {
      authorization: 'Basic Y21zLWNsaTo=',
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'client_id=cms-cli&grant_type=authorization_code',
  });
  expect(basic.status).toBe(401);
  expect(await basic.json()).toMatchObject({ error: 'invalid_client' });
  const secret = await protocolToken(world, {
    grant_type: 'authorization_code',
    client_secret: 'unaccepted',
  });
  expect(secret.status).toBe(401);
  expect(await secret.json()).toMatchObject({ error: 'invalid_client' });
});

it('preserves a code when a different client, redirect or resource attempts to exchange it', async () => {
  world = await createHttpFixture();
  const code = await authorizationCode(world);
  const fields = {
    grant_type: 'authorization_code',
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
  };
  for (const extra of [
    { client_id: 'unknown' },
    { redirect_uri: 'http://127.0.0.1:49111/callback' },
    { resource: world.config.oauth.mcpResource },
  ]) {
    const rejected = await protocolToken(world, { ...fields, ...extra });
    expect(rejected.ok).toBe(false);
  }
  expect((await protocolToken(world, fields)).status).toBe(200);
});

it('does not revoke another client when its token is supplied to the public revocation endpoint', async () => {
  world = await createHttpFixture();
  const tokens = await cliTokens(world);
  const revoke = async (clientId: string) =>
    world?.runtime.app.request('http://localhost/oauth/revoke', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, token: tokens.refresh_token }),
    });
  expect((await revoke('foreign'))?.status).toBe(200);
  expect((await api(world)('GET', '/v1/me', { token: tokens.access_token })).status).toBe(200);
  expect((await revoke('cms-cli'))?.status).toBe(200);
  expect((await api(world)('GET', '/v1/me', { token: tokens.access_token })).status).toBe(401);
  expect((await revoke('cms-cli'))?.status).toBe(200);
});

it('exposes public OAuth discovery while keeping forged origins off authenticated operations', async () => {
  world = await createHttpFixture();
  const headers = { origin: 'https://foreign.example' };
  const metadata = await world.runtime.app.request(
    'http://localhost/.well-known/oauth-authorization-server',
    { headers },
  );
  expect(metadata.status).toBe(200);
  expect(metadata.headers.get('access-control-allow-origin')).toBe('*');
  expect(await metadata.json()).toMatchObject({
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  });
  const forbidden = await world.runtime.app.request('http://localhost/v1/me', {
    headers: { ...headers, authorization: `Bearer ${world.token}` },
  });
  expect(forbidden.status).toBe(403);
  const duplicate = authorizationParameters(world);
  duplicate.append('client_id', 'cms-cli');
  const response = await world.runtime.app.request(`http://localhost/oauth/authorize?${duplicate}`);
  expect(response.status).toBe(400);
  expect(response.headers.get('location')).toBeNull();
});

it('regression: a full refresh history does not block MCP bridge requests that add no refresh token', async () => {
  world = await createHttpFixture();
  world.config.policy.delegation.maxRefreshTokens = 1;
  const code = await authorizationCode(world, { resource: world.config.oauth.mcpResource });
  const issued = await protocolToken(world, {
    grant_type: 'authorization_code',
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
    resource: world.config.oauth.mcpResource,
  });
  expect(issued.status).toBe(200);
  const value: unknown = await issued.json();
  const token = z.object({ access_token: z.string() }).parse(value);
  const bridged = await world.runtime.app.request('http://localhost/oauth/exchange', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token.access_token}`,
      'x-cms-mcp-secret': world.config.oauth.bridgeSecret,
    },
  });
  expect(bridged.status).toBe(200);
  expect(
    (await world.store.database.query("SELECT id FROM credential_tokens WHERE kind='refresh'"))
      .rowCount,
  ).toBe(1);
});
