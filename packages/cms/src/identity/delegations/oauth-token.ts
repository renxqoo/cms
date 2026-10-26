import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import type { AuthorizationRequest, OAuthConfiguration, TokenResult } from './types.ts';
import { tokenDigest } from '../tokens.ts';
import { OAuthError } from './oauth-errors.ts';
import { oauthClient } from './oauth-clients.ts';
import { grantChain, readGrant } from './grants.ts';
import { revokeProtocolGrant, observeGrant } from './protocol-audit.ts';
import { issueAccess, refreshToken } from './token-store.ts';
import { resourceKind } from './oauth-authorization.ts';

const tokenInput = z.object({
  grant_type: z.string().min(1).max(64),
  client_id: z.string().min(1).max(128),
  code: z.string().max(256).optional(),
  code_verifier: z.string().max(128).optional(),
  redirect_uri: z.string().max(2048).optional(),
  refresh_token: z.string().max(256).optional(),
  resource: z.string().max(2048).optional(),
  scope: z.string().max(512).optional(),
  client_secret: z.unknown().optional(),
});

export interface TokenOutcome {
  token?: TokenResult;
  error?: 'invalid_grant';
}

function validVerifier(verifier: string | undefined, challenge: string): boolean {
  if (!verifier || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = createHash('sha256').update(verifier).digest('base64url');
  const left = Buffer.from(computed);
  const right = Buffer.from(challenge);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function exchangeCode(
  tx: SqlExecutor,
  input: {
    params: z.infer<typeof tokenInput>;
    policy: CmsPolicy;
    config: OAuthConfiguration;
    ctx: RequestContext;
  },
): Promise<TokenOutcome> {
  const { params, policy, config } = input;
  if (!params.code) throw new OAuthError('invalid_request');
  const result = await tx.query<AuthorizationRequest>(
    'SELECT *,expires_at>clock_timestamp() AS active FROM oauth_requests WHERE code_hash=$1 FOR UPDATE',
    [tokenDigest(params.code)],
  );
  const [request] = result.rows;
  if (
    !request ||
    request.client_id !== params.client_id ||
    request.redirect_uri !== params.redirect_uri ||
    !validVerifier(params.code_verifier, request.code_challenge)
  )
    throw new OAuthError('invalid_grant');
  if (request.status === 'consumed' && request.grant_id) {
    await revokeProtocolGrant(tx, {
      grant: await readGrant(tx, request.grant_id),
      policy,
      ctx: input.ctx,
      reason: 'code_replay',
    });
    return { error: 'invalid_grant' };
  }
  if (params.resource !== undefined && resourceKind(config, params.resource) !== request.resource)
    throw new OAuthError('invalid_target');
  if (request.status !== 'approved' || !request.active || !request.grant_id)
    throw new OAuthError('invalid_grant');
  await grantChain(tx, { id: request.grant_id, policy });
  await tx.query("UPDATE oauth_requests SET status='consumed' WHERE id=$1", [request.id]);
  const grant = await readGrant(tx, request.grant_id);
  observeGrant(input.ctx, grant);
  return {
    token: await issueAccess(tx, {
      grant,
      resource: request.resource,
      policy,
      scopes: request.scopes,
      refresh: request.scopes.includes('offline_access'),
    }),
  };
}

async function rotateRefresh(
  tx: SqlExecutor,
  input: {
    params: z.infer<typeof tokenInput>;
    policy: CmsPolicy;
    config: OAuthConfiguration;
    ctx: RequestContext;
  },
): Promise<TokenOutcome> {
  const { params, policy, config } = input;
  if (!params.refresh_token) throw new OAuthError('invalid_request');
  const old = await refreshToken(tx, params.refresh_token);
  if (!old) throw new OAuthError('invalid_grant');
  const grant = await readGrant(tx, old.grant_id);
  if (grant.client_id !== params.client_id) throw new OAuthError('invalid_grant');
  if (old.consumed_at !== null) {
    await revokeProtocolGrant(tx, { grant, policy, ctx: input.ctx, reason: 'refresh_replay' });
    return { error: 'invalid_grant' };
  }
  if (params.resource !== undefined && resourceKind(config, params.resource) !== old.resource)
    throw new OAuthError('invalid_target');
  const scopes =
    params.scope === undefined ? old.scopes : params.scope.split(/\s+/).filter(Boolean);
  if (
    !scopes.includes('cms') ||
    new Set(scopes).size !== scopes.length ||
    scopes.some((scope) => !old.scopes.includes(scope))
  )
    throw new OAuthError('invalid_scope');
  if (!old.active) throw new OAuthError('invalid_grant');
  await grantChain(tx, { id: grant.id, policy });
  observeGrant(input.ctx, grant);
  await tx.query('UPDATE credential_tokens SET consumed_at=clock_timestamp() WHERE id=$1', [
    old.id,
  ]);
  return {
    token: await issueAccess(tx, {
      grant,
      resource: old.resource,
      policy,
      scopes,
      refresh: scopes.includes('offline_access'),
    }),
  };
}

export async function issueOAuthToken(
  tx: SqlExecutor,
  input: { value: unknown; policy: CmsPolicy; config: OAuthConfiguration; ctx: RequestContext },
): Promise<TokenOutcome> {
  const parsed = tokenInput.safeParse(input.value);
  if (!parsed.success) throw new OAuthError('invalid_request');
  if (parsed.data.client_secret !== undefined) throw new OAuthError('invalid_client', 401);
  if (!['authorization_code', 'refresh_token'].includes(parsed.data.grant_type))
    throw new OAuthError('unsupported_grant_type');
  const client = await oauthClient(tx, parsed.data.client_id);
  if (!client.grantTypes.includes(parsed.data.grant_type))
    throw new OAuthError('unauthorized_client');
  const request = {
    params: parsed.data,
    policy: input.policy,
    config: input.config,
    ctx: input.ctx,
  };
  return parsed.data.grant_type === 'authorization_code'
    ? exchangeCode(tx, request)
    : rotateRefresh(tx, request);
}
