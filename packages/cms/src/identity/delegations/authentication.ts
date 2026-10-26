import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Authentication, Credential, GrantRow } from './types.ts';
import { bearerSchema } from './validation.ts';
import { grantChain, grantOperations, delegationPermits, assertGrantOperation } from './grants.ts';
import { tokenDigest } from '../tokens.ts';
import { findAccount } from '../adapters/postgres/accounts.ts';

export async function tokenGrant(
  tx: SqlExecutor,
  input: { token: string; resource: Credential['resource']; policy: CmsPolicy },
): Promise<GrantRow> {
  const result = await tx.query<{ grant_id: string }>(
    `SELECT grant_id FROM credential_tokens WHERE token_hash=$1 AND kind='access' AND resource=$2 AND consumed_at IS NULL AND expires_at>clock_timestamp()`,
    [tokenDigest(input.token), input.resource],
  );
  const id = result.rows[0]?.grant_id;
  if (!id) fail('unauthenticated');
  const chain = await grantChain(tx, { id, policy: input.policy });
  const [first] = chain;
  if (!first) fail('unauthenticated');
  return {
    ...first,
    grants: grantOperations(first).filter((grant) =>
      chain.every((row) => delegationPermits(grantOperations(row), grant.operationId, grant)),
    ),
  };
}

export async function keyGrant(
  tx: SqlExecutor,
  token: string,
  policy: CmsPolicy,
): Promise<GrantRow> {
  const result = await tx.query<{ id: string }>(
    "SELECT id FROM credential_grants WHERE key_hash=$1 AND kind='api_key' AND resource='mcp'",
    [tokenDigest(token)],
  );
  const id = result.rows[0]?.id;
  if (!id) fail('unauthenticated');
  const chain = await grantChain(tx, { id, policy });
  const [first] = chain;
  if (!first) fail('unauthenticated');
  return first;
}

export async function authenticateCredential(
  tx: SqlExecutor,
  ctx: RequestContext,
  policy: CmsPolicy,
): Promise<Authentication> {
  const parsed = bearerSchema.safeParse(ctx.token);
  if (!parsed.success) fail('unauthenticated');
  const result = await tx.query<{ admin_id: string }>(
    'SELECT admin_id FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()',
    [tokenDigest(parsed.data)],
  );
  const [session] = result.rows;
  const delegation = session
    ? null
    : await tokenGrant(tx, { token: parsed.data, resource: 'api', policy });
  const account = await findAccount(tx, session?.admin_id ?? delegation?.admin_id ?? '');
  if (account?.status !== 'active' || account.activation !== 'activated') fail('unauthenticated');
  ctx.onAuthenticated?.(account.id);
  if (delegation) {
    ctx.onCredential?.(delegation.id);
    await tx.query(
      "UPDATE credential_grants SET last_used_at=clock_timestamp() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<clock_timestamp()-$2*interval '1 millisecond')",
      [delegation.id, policy.delegation.lastUsedIntervalMs],
    );
  }
  return { account, delegation };
}

export async function authenticateOperation(
  tx: SqlExecutor,
  input: { ctx: RequestContext; policy: CmsPolicy; operationId: string },
) {
  const result = await authenticateCredential(tx, input.ctx, input.policy);
  if (result.delegation)
    await assertGrantOperation(tx, {
      id: result.delegation.id,
      adminId: result.account.id,
      operationId: input.operationId,
      scope: { scopeKind: 'global', collectionKey: null },
      policy: input.policy,
    });
  return result.account;
}
