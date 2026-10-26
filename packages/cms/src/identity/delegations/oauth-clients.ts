import { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import { randomToken } from '../tokens.ts';
import type { OAuthClient } from './types.ts';
import { OAuthError } from './oauth-errors.ts';

const registration = z.object({
  client_name: z.string().trim().min(1).max(80).default('MCP client'),
  redirect_uris: z.array(z.url().max(2048)).min(1).max(10),
  grant_types: z
    .array(z.enum(['authorization_code', 'refresh_token']))
    .min(1)
    .default(['authorization_code']),
  response_types: z.array(z.literal('code')).length(1).default(['code']),
  token_endpoint_auth_method: z.literal('none').default('none'),
  scope: z.string().max(512).optional(),
  application_type: z.enum(['native', 'web']).optional(),
});

function loopback(url: URL): boolean {
  return url.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(url.hostname);
}

function safeRedirect(value: string): boolean {
  const url = new URL(value);
  return (
    !url.username && !url.password && !url.hash && (url.protocol === 'https:' || loopback(url))
  );
}

export function matchRedirect(client: OAuthClient, redirectUri: string): boolean {
  if (!safeRedirect(redirectUri)) return false;
  const requested = new URL(redirectUri);
  const candidates =
    client.id === 'cms-cli'
      ? ['http://127.0.0.1/callback', 'http://[::1]/callback']
      : client.redirectUris;
  return candidates.some((value) => {
    if (value === redirectUri) return true;
    const registered = new URL(value);
    return (
      client.native &&
      loopback(registered) &&
      loopback(requested) &&
      requested.hostname === registered.hostname &&
      requested.pathname === registered.pathname &&
      requested.search === registered.search
    );
  });
}

export async function oauthClient(tx: SqlExecutor, id: string): Promise<OAuthClient> {
  if (id === 'cms-cli') {
    await tx.query(
      "INSERT INTO oauth_clients(id,name,redirect_uris,grant_types,scopes,native) VALUES('cms-cli','CMS CLI','[]'::jsonb,ARRAY['authorization_code','refresh_token'],ARRAY['cms','offline_access'],true) ON CONFLICT(id) DO NOTHING",
    );
    return {
      id,
      name: 'CMS CLI',
      redirectUris: [],
      native: true,
      grantTypes: ['authorization_code', 'refresh_token'],
      scopes: ['cms', 'offline_access'],
    };
  }
  const result = await tx.query<{
    id: string;
    name: string;
    redirect_uris: unknown;
    grant_types: string[];
    scopes: string[];
    native: boolean;
  }>(
    'SELECT id,name,redirect_uris,grant_types,scopes,native FROM oauth_clients WHERE id=$1 AND (expires_at IS NULL OR expires_at>clock_timestamp())',
    [id],
  );
  const [row] = result.rows;
  if (!row) throw new OAuthError('invalid_client', 401);
  const parsed = z.array(z.string()).safeParse(row.redirect_uris);
  if (!parsed.success) throw new OAuthError('invalid_client', 401);
  return {
    id: row.id,
    name: row.name,
    redirectUris: parsed.data,
    native: row.native,
    grantTypes: row.grant_types,
    scopes: row.scopes,
  };
}

function validateScopes(scopes: string[], grantTypes: string[]): void {
  if (
    !scopes.includes('cms') ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !['cms', 'offline_access'].includes(scope)) ||
    (scopes.includes('offline_access') && !grantTypes.includes('refresh_token'))
  )
    throw new OAuthError('invalid_scope');
}

function validateRedirects(uris: string[], native: boolean): void {
  if (
    new Set(uris).size !== uris.length ||
    uris.some((uri) => !safeRedirect(uri) || (!native && new URL(uri).protocol !== 'https:'))
  )
    throw new OAuthError('invalid_request');
}

function clientRegistration(value: unknown) {
  const parsed = registration.safeParse(value);
  if (!parsed.success) throw new OAuthError('invalid_request');
  const input = parsed.data;
  const scopes =
    input.scope?.split(/\s+/).filter(Boolean) ??
    (input.grant_types.includes('refresh_token') ? ['cms', 'offline_access'] : ['cms']);
  const native =
    input.application_type === 'native' ||
    (input.application_type === undefined &&
      input.redirect_uris.every((uri) => loopback(new URL(uri))));
  if (
    !input.grant_types.includes('authorization_code') ||
    new Set(input.grant_types).size !== input.grant_types.length
  )
    throw new OAuthError('invalid_request');
  validateRedirects(input.redirect_uris, native);
  validateScopes(scopes, input.grant_types);
  return { input, scopes, native };
}

export async function registerClient(tx: SqlExecutor, value: unknown, policy: CmsPolicy) {
  const { input, scopes, native } = clientRegistration(value);
  const count = await tx.query<{ total: string }>('SELECT count(*) AS total FROM oauth_clients');
  if (Number(count.rows[0]?.total ?? 0) >= policy.delegation.maxClients) fail('capacity_exceeded');
  const id = randomToken();
  await tx.query(
    "INSERT INTO oauth_clients(id,name,redirect_uris,expires_at,grant_types,scopes,native) VALUES($1,$2,$3::jsonb,clock_timestamp()+$4*interval '1 millisecond',$5,$6,$7)",
    [
      id,
      input.client_name,
      JSON.stringify(input.redirect_uris),
      policy.delegation.clientTtlMs,
      input.grant_types,
      scopes,
      native,
    ],
  );
  return {
    ...input,
    scope: scopes.join(' '),
    application_type: native ? 'native' : 'web',
    client_id: id,
    client_id_issued_at: Math.floor(Date.now() / 1000),
  };
}
