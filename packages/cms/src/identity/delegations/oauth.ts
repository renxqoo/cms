import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { IdentityDependencies } from '../runtime.ts';
import { secure } from '../runtime.ts';
import { requireRateLimit, rateLimitKey } from '@new-cms/cms/platform/rate-limits';
import { registerClient } from './oauth-clients.ts';
import { startAuthorization } from './oauth-authorization.ts';
import { issueOAuthToken } from './oauth-token.ts';
import { OAuthError } from './oauth-errors.ts';
import { issueAccess } from './token-store.ts';
import { keyGrant, tokenGrant } from './authentication.ts';
import { revokeProtocolGrant } from './protocol-audit.ts';
import { readGrant } from './grants.ts';
import { tokenDigest } from '../tokens.ts';
import { findAccount } from '../adapters/postgres/accounts.ts';
import type { OAuthConfiguration } from './types.ts';

async function admit(deps: IdentityDependencies, ctx: RequestContext, operation: string) {
  await deps.database.transaction(
    (tx) =>
      requireRateLimit(tx, {
        key: rateLimitKey(deps.policy.rateLimitSecret, ['oauth', operation, ctx.ip]),
        limit: deps.policy.loginIpLimit,
        windowMs: deps.policy.rateWindowMs,
      }),
    ctx.signal,
  );
}

function metadata(config: OAuthConfiguration) {
  return {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/authorize`,
    token_endpoint: `${config.issuer}/oauth/token`,
    registration_endpoint: `${config.issuer}/oauth/register`,
    revocation_endpoint: `${config.issuer}/oauth/revoke`,
    userinfo_endpoint: `${config.issuer}/oauth/userinfo`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_methods_supported: ['none'],
    revocation_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
    scopes_supported: ['cms', 'offline_access'],
    authorization_response_iss_parameter_supported: true,
  };
}

async function token(
  deps: IdentityDependencies,
  config: OAuthConfiguration,
  request: { ctx: RequestContext; value: unknown },
) {
  await admit(deps, request.ctx, 'token');
  const result = await secure(deps, request.ctx, (tx) =>
    issueOAuthToken(tx, { value: request.value, policy: deps.policy, config, ctx: request.ctx }),
  );
  if (result.error || !result.token) throw new OAuthError('invalid_grant');
  return result.token;
}

function bridgeMatches(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function exchange(
  deps: IdentityDependencies,
  config: OAuthConfiguration,
  request: { ctx: RequestContext; value: unknown },
) {
  const input = z
    .object({ token: z.string().min(1).max(256), bridgeSecret: z.string().max(4096) })
    .safeParse(request.value);
  if (!input.success || !bridgeMatches(input.data.bridgeSecret, config.bridgeSecret))
    throw new OAuthError('invalid_client', 401);
  return secure(deps, request.ctx, async (tx) => {
    const grant = input.data.token.startsWith('cmsk_')
      ? await keyGrant(tx, input.data.token, deps.policy)
      : await tokenGrant(tx, { token: input.data.token, resource: 'mcp', policy: deps.policy });
    const account = await findAccount(tx, grant.admin_id);
    if (account?.status !== 'active' || account.activation !== 'activated')
      throw new OAuthError('invalid_grant');
    request.ctx.onAuthenticated?.(account.id);
    request.ctx.onCredential?.(grant.id);
    return issueAccess(tx, {
      grant,
      resource: 'api',
      policy: deps.policy,
      scopes: ['cms'],
      refresh: false,
    });
  });
}

async function revoke(
  deps: IdentityDependencies,
  request: { ctx: RequestContext; value: unknown },
) {
  const input = z
    .object({
      token: z.string().min(1).max(256),
      client_id: z.string().min(1).max(128),
      token_type_hint: z.string().optional(),
    })
    .safeParse(request.value);
  if (!input.success) throw new OAuthError('invalid_request');
  await admit(deps, request.ctx, 'revoke');
  await secure(deps, request.ctx, async (tx) => {
    const result = await tx.query<{ grant_id: string; client_id: string | null }>(
      'SELECT t.grant_id,g.client_id FROM credential_tokens t JOIN credential_grants g ON g.id=t.grant_id WHERE t.token_hash=$1',
      [tokenDigest(input.data.token)],
    );
    const [row] = result.rows;
    if (row && row.client_id === input.data.client_id)
      await revokeProtocolGrant(tx, {
        grant: await readGrant(tx, row.grant_id),
        ctx: request.ctx,
        policy: deps.policy,
        reason: 'client_revoke',
      });
  });
}

async function userInfo(deps: IdentityDependencies, ctx: RequestContext) {
  if (!ctx.token) throw new OAuthError('invalid_token', 401);
  try {
    return await secure(deps, ctx, async (tx) => {
      const auth = await tx.query<{ resource: 'api' | 'mcp' }>(
        "SELECT resource FROM credential_tokens WHERE token_hash=$1 AND kind='access'",
        [tokenDigest(ctx.token ?? '')],
      );
      const resource = auth.rows[0]?.resource;
      if (!resource) throw new OAuthError('invalid_token', 401);
      const grant = await tokenGrant(tx, { token: ctx.token ?? '', resource, policy: deps.policy });
      const account = await findAccount(tx, grant.admin_id);
      if (account?.status !== 'active' || account.activation !== 'activated')
        throw new OAuthError('invalid_token', 401);
      ctx.onAuthenticated?.(account.id);
      ctx.onCredential?.(grant.id);
      return { sub: account.id, name: account.displayName ?? account.email };
    });
  } catch (error) {
    if (
      error instanceof CmsError &&
      ['unauthenticated', 'forbidden', 'token_invalid'].includes(error.code)
    )
      throw new OAuthError('invalid_token', 401);
    throw error;
  }
}

export function createOAuth(deps: IdentityDependencies, configuration: OAuthConfiguration) {
  const config = { ...configuration };
  return {
    metadata: () => metadata(config),
    async authorize(ctx: RequestContext, value: unknown) {
      await admit(deps, ctx, 'authorize');
      return secure(deps, ctx, (tx) =>
        startAuthorization(tx, { value, configuration: config, policy: deps.policy }),
      );
    },
    async register(ctx: RequestContext, value: unknown) {
      await admit(deps, ctx, 'register');
      return secure(deps, ctx, (tx) => registerClient(tx, value, deps.policy));
    },
    token: (ctx: RequestContext, value: unknown) => token(deps, config, { ctx, value }),
    exchange: (ctx: RequestContext, value: unknown) => exchange(deps, config, { ctx, value }),
    revoke: (ctx: RequestContext, value: unknown) => revoke(deps, { ctx, value }),
    userInfo: (ctx: RequestContext) => userInfo(deps, ctx),
  };
}

export type OAuthApi = ReturnType<typeof createOAuth>;

export function oauthFailure(error: unknown): {
  error: string;
  status: number;
  retryAfterSeconds?: number;
} {
  if (error instanceof OAuthError) return { error: error.oauthError, status: error.oauthStatus };
  if (
    error instanceof CmsError &&
    ['unauthenticated', 'forbidden', 'token_invalid'].includes(error.code)
  )
    return { error: 'invalid_grant', status: 400 };
  if (
    error instanceof CmsError &&
    ['invalid_input', 'unsupported_media_type', 'payload_too_large'].includes(error.code)
  )
    return { error: 'invalid_request', status: error.status };
  if (error instanceof CmsError && error.status === 429)
    return {
      error: 'temporarily_unavailable',
      status: 429,
      ...(error.retryAfterSeconds === undefined
        ? {}
        : { retryAfterSeconds: error.retryAfterSeconds }),
    };
  return { error: 'temporarily_unavailable', status: 503 };
}
