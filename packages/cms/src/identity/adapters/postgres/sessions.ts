import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import type { Account, LoginResult } from '../../types.ts';
import { randomToken, tokenDigest } from '../../tokens.ts';
import { authenticateCredential, authenticateOperation } from '../../delegations/authentication.ts';
import { revokeGrant } from '../../delegations/manage.ts';

export async function authenticate(
  tx: SqlExecutor,
  ctx: RequestContext,
  policy: CmsPolicy,
): Promise<Account> {
  return (await authenticateCredential(tx, ctx, policy)).account;
}

export async function issueSession(
  tx: SqlExecutor,
  input: { adminId: string; policy: CmsPolicy },
): Promise<LoginResult> {
  const token = randomToken();
  await tx.query(
    `UPDATE sessions SET revoked_at=clock_timestamp() WHERE id IN (
    SELECT id FROM sessions WHERE admin_id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()
    ORDER BY created_at DESC,id DESC OFFSET $2)`,
    [input.adminId, input.policy.maxSessions - 1],
  );
  const result = await tx.query<{ expires_at: Date }>(
    `INSERT INTO sessions(id,admin_id,token_hash,created_at,expires_at)
    VALUES($1,$2,$3,clock_timestamp(),clock_timestamp()+$4*interval '1 millisecond') RETURNING expires_at`,
    [randomUUID(), input.adminId, tokenDigest(token), input.policy.sessionTtlMs],
  );
  const [row] = result.rows;
  if (!row) fail('internal_error');
  await tx.query('UPDATE admins SET last_login_at=clock_timestamp() WHERE id=$1', [input.adminId]);
  return { token, tokenType: 'Bearer', expiresAt: row.expires_at.toISOString() };
}

export async function revokeSession(
  tx: SqlExecutor,
  input: { token: string; ctx: RequestContext; policy: CmsPolicy },
): Promise<{ adminId: string; changed: boolean; authenticated: boolean }> {
  const result = await tx.query<{
    admin_id: string;
    revoked_at: Date | null;
    authenticated: boolean;
  }>(
    `SELECT s.admin_id,s.revoked_at,s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
    AND EXISTS(SELECT 1 FROM admins a JOIN credentials c ON c.admin_id=a.id
    WHERE a.id=s.admin_id AND a.status='active') AS authenticated
    FROM sessions s WHERE s.token_hash=$1 FOR UPDATE`,
    [tokenDigest(input.token)],
  );
  const [row] = result.rows;
  if (!row) return revokeDelegatedSession(tx, input);
  if (row.revoked_at === null)
    await tx.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [
      tokenDigest(input.token),
    ]);
  return {
    adminId: row.admin_id,
    changed: row.revoked_at === null,
    authenticated: row.authenticated,
  };
}

async function revokeDelegatedSession(
  tx: SqlExecutor,
  input: { token: string; ctx: RequestContext; policy: CmsPolicy },
) {
  const result = await tx.query<{ id: string; admin_id: string; active: boolean }>(
    "SELECT g.id,g.admin_id,g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AS active FROM credential_tokens t JOIN credential_grants g ON g.id=t.grant_id WHERE t.token_hash=$1 AND t.kind='access' AND t.resource='api'",
    [tokenDigest(input.token)],
  );
  const [row] = result.rows;
  if (!row) fail('unauthenticated');
  if (row.active)
    await authenticateOperation(tx, {
      ctx: input.ctx,
      policy: input.policy,
      operationId: 'identity.logout',
    });
  const changed = await revokeGrant(tx, row.id);
  return { adminId: row.admin_id, changed: changed > 0, authenticated: row.active };
}
