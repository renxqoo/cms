import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy, RequestContext } from '@new-cms/cms/platform/contracts';
import type { Account, LoginResult } from '../../types.ts';
import { findAccount } from './accounts.ts';
import { checkedToken } from '../../validation.ts';

export function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function authenticate(tx: SqlExecutor, ctx: RequestContext): Promise<Account> {
  const token = checkedToken(ctx.token);
  const result = await tx.query<{ admin_id: string }>(
    `SELECT admin_id FROM sessions
    WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()`,
    [tokenDigest(token)],
  );
  const [row] = result.rows;
  if (!row) fail('unauthenticated');
  const account = await findAccount(tx, row.admin_id);
  if (account?.status !== 'active' || account.activation !== 'activated') fail('unauthenticated');
  ctx.onAuthenticated?.(account.id);
  return account;
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
  token: string,
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
    [tokenDigest(token)],
  );
  const [row] = result.rows;
  if (!row) fail('unauthenticated');
  if (row.revoked_at === null)
    await tx.query('UPDATE sessions SET revoked_at=clock_timestamp() WHERE token_hash=$1', [
      tokenDigest(token),
    ]);
  return {
    adminId: row.admin_id,
    changed: row.revoked_at === null,
    authenticated: row.authenticated,
  };
}
