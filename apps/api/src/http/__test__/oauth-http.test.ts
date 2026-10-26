import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createHttpFixture, api } from './support.ts';
import type { HttpFixture } from './support.ts';
import {
  authorizationParameters,
  authorizationCode,
  protocolToken,
  cliTokens,
  oauthVerifier,
  cliRedirect,
} from './oauth-support.ts';

let fixture: HttpFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

function register(world: HttpFixture, body: unknown) {
  return world.runtime.app.request('http://localhost/oauth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

it.each([
  ['scope', 'unknown', 'invalid_scope'],
  ['code_challenge_method', 'plain', 'invalid_request'],
  ['code_challenge', 'short', 'invalid_request'],
  ['response_type', 'token', 'unsupported_response_type'],
  ['resource', 'https://foreign.example/mcp', 'invalid_target'],
])(
  'returns the %s authorization error to the verified callback with state',
  async (field, value, error) => {
    fixture = await createHttpFixture();
    const response = await fixture.runtime.app.request(
      `http://localhost/oauth/authorize?${authorizationParameters(fixture, { [field]: value })}`,
    );
    expect(response.status).toBe(302);
    const target = new URL(response.headers.get('location') ?? '');
    expect(target.origin + target.pathname).toBe('http://127.0.0.1:49236/callback');
    expect(target.searchParams.get('error')).toBe(error);
    expect(target.searchParams.get('state')).toBe('independent-state');
    expect(target.searchParams.get('iss')).toBe(fixture.config.oauth.issuer);
  },
);

it.each([
  'https://attacker.example/callback',
  'javascript:alert(1)',
  'http://127.0.0.1:49236/other',
])('does not redirect an invalid callback %s', async (redirect) => {
  fixture = await createHttpFixture();
  const response = await fixture.runtime.app.request(
    `http://localhost/oauth/authorize?${authorizationParameters(fixture, { redirect_uri: redirect })}`,
  );
  expect(response.status).toBe(400);
  expect(response.headers.get('location')).toBeNull();
});

it('does not let authorization or refresh exceed registered client capabilities', async () => {
  fixture = await createHttpFixture();
  const created = await register(fixture, {
    client_name: 'No refresh',
    redirect_uris: ['http://127.0.0.1:49236/callback'],
    grant_types: ['authorization_code'],
    scope: 'cms',
  });
  expect(created.status).toBe(201);
  const client = z.object({ client_id: z.string() }).parse(await created.json());
  const rejected = await fixture.runtime.app.request(
    `http://localhost/oauth/authorize?${authorizationParameters(fixture, { client_id: client.client_id })}`,
  );
  expect(new URL(rejected.headers.get('location') ?? '').searchParams.get('error')).toBe(
    'invalid_scope',
  );
  const code = await authorizationCode(fixture, { client_id: client.client_id, scope: 'cms' });
  const exchanged = await protocolToken(fixture, {
    grant_type: 'authorization_code',
    client_id: client.client_id,
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
  });
  expect(exchanged.status).toBe(200);
  expect(await exchanged.json()).not.toHaveProperty('refresh_token');
  const refreshed = await protocolToken(fixture, {
    grant_type: 'refresh_token',
    client_id: client.client_id,
    refresh_token: 'unavailable',
  });
  expect(refreshed.status).toBe(400);
  expect(await refreshed.json()).toMatchObject({ error: 'unauthorized_client' });
});

it('rejects web loopback callbacks and only applies port flexibility to native public clients', async () => {
  fixture = await createHttpFixture();
  for (const application_type of ['web', 'native']) {
    const registration = await register(fixture, {
      client_name: application_type,
      application_type,
      redirect_uris: ['http://localhost:49111/callback'],
      grant_types: ['authorization_code'],
      scope: 'cms',
    });
    expect(registration.status).toBe(application_type === 'web' ? 400 : 201);
    if (application_type === 'web') continue;
    const client = z.object({ client_id: z.string() }).parse(await registration.json());
    const response = await fixture.runtime.app.request(
      `http://localhost/oauth/authorize?${authorizationParameters(fixture, { client_id: client.client_id, scope: 'cms', redirect_uri: 'http://localhost:49222/callback' })}`,
    );
    expect(response.status).toBe(302);
  }
});

it('rejects duplicate JSON metadata members including Unicode-escaped duplicate names', async () => {
  fixture = await createHttpFixture();
  for (const name of ['client_name', 'client_\\u006eame']) {
    const body = `{"client_name":"first","${name}":"second","redirect_uris":["https://client.example/callback"]}`;
    const response = await fixture.runtime.app.request('http://localhost/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_request' });
  }
  expect((await fixture.store.database.query('SELECT id FROM oauth_clients')).rowCount).toBe(0);
});

it('ignores bounded unknown registration metadata and token extensions', async () => {
  fixture = await createHttpFixture();
  const result = await register(fixture, {
    client_name: 'Extensible',
    redirect_uris: ['https://client.example/callback'],
    future_metadata: { nested: ['one', 'two'] },
  });
  expect(result.status).toBe(201);
  expect(await result.json()).not.toHaveProperty('future_metadata');
  const code = await authorizationCode(fixture);
  const response = await protocolToken(fixture, {
    grant_type: 'authorization_code',
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
    future_parameter: 'ignored',
  });
  expect(response.status).toBe(200);
});

it('rejects an incorrect PKCE verifier without consuming the valid authorization code', async () => {
  fixture = await createHttpFixture();
  const code = await authorizationCode(fixture);
  const bad = await protocolToken(fixture, {
    grant_type: 'authorization_code',
    code,
    code_verifier: 'w'.repeat(64),
    redirect_uri: cliRedirect,
  });
  expect(bad.status).toBe(400);
  expect(await bad.json()).toMatchObject({ error: 'invalid_grant' });
  const good = await protocolToken(fixture, {
    grant_type: 'authorization_code',
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
  });
  expect(good.status).toBe(200);
});

it('revokes the issued grant after a valid authorization code is replayed', async () => {
  fixture = await createHttpFixture();
  const code = await authorizationCode(fixture);
  const fields = {
    grant_type: 'authorization_code',
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
  };
  const issued = z
    .object({ access_token: z.string() })
    .parse(await (await protocolToken(fixture, fields)).json());
  expect((await protocolToken(fixture, fields)).status).toBe(400);
  expect((await api(fixture)('GET', '/v1/me', { token: issued.access_token })).status).toBe(401);
});

it('returns a Bearer invalid_token challenge for missing, expired and revoked userinfo credentials', async () => {
  fixture = await createHttpFixture();
  const tokens = await cliTokens(fixture);
  const success = await fixture.runtime.app.request('http://localhost/oauth/userinfo', {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  expect(success.status).toBe(200);
  expect(await success.json()).toMatchObject({ sub: fixture.admin.id });
  await fixture.store.database.query(
    "UPDATE credential_tokens SET created_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 hour' WHERE kind='access'",
  );
  for (const token of [undefined, 'unknown-token', tokens.access_token]) {
    const response = await fixture.runtime.app.request('http://localhost/oauth/userinfo', {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('invalid_token');
    expect(await response.json()).toMatchObject({ error: 'invalid_token' });
  }
});

it('returns only the requested reduced scopes when refreshing', async () => {
  fixture = await createHttpFixture();
  const tokens = await cliTokens(fixture);
  const response = await protocolToken(fixture, {
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    scope: 'cms',
  });
  expect(response.status).toBe(200);
  const result = z
    .object({ scope: z.string(), refresh_token: z.string().optional() })
    .parse(await response.json());
  expect(result.scope).toBe('cms');
  expect(result.refresh_token).toBeUndefined();
});

it.each([{ scope: 'unknown' }, { resource: 'https://foreign.example/mcp' }])(
  'regression: rejects consumed refresh replay and revokes its family even when extra parameters are invalid %j',
  async (extra) => {
    fixture = await createHttpFixture();
    const initial = await cliTokens(fixture);
    const rotated = await protocolToken(fixture, {
      grant_type: 'refresh_token',
      refresh_token: initial.refresh_token,
    });
    const next = z.object({ access_token: z.string() }).parse(await rotated.json());
    const replay = await protocolToken(fixture, {
      grant_type: 'refresh_token',
      refresh_token: initial.refresh_token,
      ...extra,
    });
    expect(replay.status).toBe(400);
    expect(await replay.json()).toMatchObject({ error: 'invalid_grant' });
    expect((await api(fixture)('GET', '/v1/me', { token: next.access_token })).status).toBe(401);
    const audit = await fixture.store.database.query(
      "SELECT detail FROM audit_events WHERE operation_id='oauth.refresh_replay'",
    );
    expect(audit.rows).toEqual([{ detail: { revoked: 1 } }]);
  },
);

it('regression: returns authorization capacity rejection to the verified callback instead of leaving the CLI waiting', async () => {
  fixture = await createHttpFixture();
  fixture.config.policy.delegation.maxRequests = 1;
  expect(
    (
      await fixture.runtime.app.request(
        `http://localhost/oauth/authorize?${authorizationParameters(fixture)}`,
      )
    ).status,
  ).toBe(302);
  const rejected = await fixture.runtime.app.request(
    `http://localhost/oauth/authorize?${authorizationParameters(fixture)}`,
  );
  expect(rejected.status).toBe(302);
  const callback = new URL(rejected.headers.get('location') ?? '');
  expect(callback.origin + callback.pathname).toBe(cliRedirect);
  expect(callback.searchParams.get('error')).toBe('temporarily_unavailable');
  expect(callback.searchParams.get('state')).toBe('independent-state');
  expect(callback.searchParams.get('iss')).toBe(fixture.config.oauth.issuer);
});
