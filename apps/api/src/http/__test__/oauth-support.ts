import { createHash } from 'node:crypto';
import { expect } from 'vitest';
import { z } from 'zod';
import { api } from './support.ts';
import type { HttpFixture } from './support.ts';

export const administratorRead = {
  operationId: 'admins.list',
  scopeKind: 'global',
  collectionKey: null,
};
export const oauthVerifier = 'v'.repeat(64);
export const cliRedirect = 'http://127.0.0.1:49236/callback';

export function authorizationParameters(world: HttpFixture, extra: Record<string, string> = {}) {
  return new URLSearchParams({
    response_type: 'code',
    client_id: 'cms-cli',
    redirect_uri: cliRedirect,
    code_challenge: createHash('sha256').update(oauthVerifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'cms offline_access',
    state: 'independent-state',
    resource: world.config.oauth.issuer,
    ...extra,
  });
}

export async function authorizationCode(world: HttpFixture, extra: Record<string, string> = {}) {
  const response = await world.runtime.app.request(
    `http://localhost/oauth/authorize?${authorizationParameters(world, extra)}`,
  );
  expect(response.status).toBe(302);
  const requestId = new URL(response.headers.get('location') ?? '').searchParams.get('request');
  expect(requestId).toBeTruthy();
  const decision = await api(world)('POST', `/v1/oauth/requests/${requestId}/decisions`, {
    body: { approved: true, grants: [administratorRead] },
  });
  expect(decision.status).toBe(200);
  const { redirectTo } = z.object({ redirectTo: z.string() }).parse(await decision.json());
  const code = new URL(redirectTo).searchParams.get('code');
  if (!code) throw new Error('Authorization did not issue a code');
  return code;
}

export function protocolToken(world: HttpFixture, fields: Record<string, string>) {
  return world.runtime.app.request('http://localhost/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: 'cms-cli', ...fields }),
  });
}

export async function cliTokens(world: HttpFixture) {
  const code = await authorizationCode(world);
  const response = await protocolToken(world, {
    grant_type: 'authorization_code',
    code,
    code_verifier: oauthVerifier,
    redirect_uri: cliRedirect,
  });
  expect(response.status).toBe(200);
  return z
    .object({ access_token: z.string(), refresh_token: z.string() })
    .parse(await response.json());
}
