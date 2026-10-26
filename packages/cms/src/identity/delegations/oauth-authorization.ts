import { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { fail, CmsError } from '@new-cms/cms/platform/contracts';
import type { OAuthConfiguration, Credential, OAuthClient } from './types.ts';
import { oauthClient, matchRedirect } from './oauth-clients.ts';
import { OAuthError } from './oauth-errors.ts';
import { randomToken } from '../tokens.ts';
import { authorizationRedirect } from './requests.ts';

const authorization = z.object({
  response_type: z.string().max(64),
  client_id: z.string().min(1).max(128),
  redirect_uri: z.url().max(2048),
  code_challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  code_challenge_method: z.literal('S256'),
  scope: z.string().max(512).default('cms'),
  state: z.string().max(1024).optional(),
  resource: z.string().max(2048).optional(),
});

export function resourceKind(
  config: OAuthConfiguration,
  value: string | undefined,
): Credential['resource'] {
  if (value === undefined || value === config.issuer) return 'api';
  if (value === config.mcpResource) return 'mcp';
  throw new OAuthError('invalid_target');
}

export async function startAuthorization(
  tx: SqlExecutor,
  input: { value: unknown; configuration: OAuthConfiguration; policy: CmsPolicy },
) {
  const target = authorization
    .pick({ client_id: true, redirect_uri: true, state: true })
    .safeParse(input.value);
  if (!target.success) throw new OAuthError('invalid_request');
  const client = await oauthClient(tx, target.data.client_id);
  if (!matchRedirect(client, target.data.redirect_uri)) throw new OAuthError('invalid_request');
  try {
    return await createAuthorization(tx, { ...input, client });
  } catch (error) {
    const code = authorizationError(error);
    return {
      redirectTo: authorizationRedirect(
        {
          redirect_uri: target.data.redirect_uri,
          state: target.data.state ?? null,
          issuer: input.configuration.issuer,
        },
        { error: code },
      ),
    };
  }
}

function authorizationError(error: unknown): string {
  if (error instanceof OAuthError) return error.oauthError;
  if (
    error instanceof CmsError &&
    ['capacity_exceeded', 'rate_limited', 'temporarily_unavailable'].includes(error.code)
  )
    return 'temporarily_unavailable';
  throw error;
}

async function createAuthorization(
  tx: SqlExecutor,
  input: {
    value: unknown;
    configuration: OAuthConfiguration;
    policy: CmsPolicy;
    client: OAuthClient;
  },
) {
  const parsed = authorization.safeParse(input.value);
  if (!parsed.success) throw new OAuthError('invalid_request');
  const params = parsed.data;
  if (params.response_type !== 'code') throw new OAuthError('unsupported_response_type');
  const resource = resourceKind(input.configuration, params.resource);
  const scopes = params.scope.split(/\s+/).filter(Boolean);
  if (
    !scopes.includes('cms') ||
    scopes.some((scope) => !input.client.scopes.includes(scope)) ||
    new Set(scopes).size !== scopes.length
  )
    throw new OAuthError('invalid_scope');
  const count = await tx.query<{ total: string }>('SELECT count(*) AS total FROM oauth_requests');
  if (Number(count.rows[0]?.total ?? 0) >= input.policy.delegation.maxRequests)
    fail('capacity_exceeded');
  const id = randomToken();
  await tx.query(
    "INSERT INTO oauth_requests(id,client_id,redirect_uri,issuer,resource_uri,resource,scopes,state,code_challenge,status,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',clock_timestamp()+$10*interval '1 millisecond')",
    [
      id,
      input.client.id,
      params.redirect_uri,
      input.configuration.issuer,
      resource === 'api' ? input.configuration.issuer : input.configuration.mcpResource,
      resource,
      scopes,
      params.state ?? null,
      params.code_challenge,
      input.policy.delegation.requestTtlMs,
    ],
  );
  const redirect = new URL('/authorize', input.configuration.frontendUrl);
  redirect.searchParams.set('request', id);
  return { redirectTo: redirect.href };
}
