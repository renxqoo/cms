import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { TokenPurpose } from '../../types.ts';
import { randomToken, tokenDigest } from '../../tokens.ts';

export interface ActionToken {
  id: string;
  admin_id: string;
  email: string;
  activated: boolean;
}

export async function validAction(
  tx: SqlExecutor,
  input: { token: string; purpose: TokenPurpose },
): Promise<ActionToken> {
  const result = await tx.query<ActionToken>(
    `SELECT t.id,t.admin_id,a.email,
    EXISTS(SELECT 1 FROM credentials c WHERE c.admin_id=a.id) AS activated
    FROM action_tokens t JOIN admins a ON a.id=t.admin_id
    WHERE t.token_hash=$1 AND t.purpose=$2 AND t.consumed_at IS NULL
    AND t.revoked_at IS NULL AND t.expires_at>clock_timestamp() AND a.status='active'`,
    [tokenDigest(input.token), input.purpose],
  );
  const [row] = result.rows;
  if (!row || row.activated !== (input.purpose === 'password_reset')) fail('token_invalid');
  return row;
}

export async function consumeAction(tx: SqlExecutor, id: string): Promise<void> {
  const result = await tx.query(
    `UPDATE action_tokens SET consumed_at=clock_timestamp()
    WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>clock_timestamp()`,
    [id],
  );
  if (result.rowCount !== 1) fail('token_invalid');
}

export async function tokenCooldown(
  tx: SqlExecutor,
  input: {
    adminId: string;
    purpose: TokenPurpose;
    cooldownMs: number;
  },
): Promise<boolean> {
  const result = await tx.query<{ cooling: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM action_tokens
    WHERE admin_id=$1 AND purpose=$2 AND created_at>clock_timestamp()-$3*interval '1 millisecond') AS cooling`,
    [input.adminId, input.purpose, input.cooldownMs],
  );
  return result.rows[0]?.cooling ?? false;
}

export async function issueAction(
  tx: SqlExecutor,
  input: {
    adminId: string;
    purpose: TokenPurpose;
    ttlMs: number;
  },
): Promise<{ id: string; token: string }> {
  await tx.query(
    `UPDATE action_tokens SET revoked_at=clock_timestamp() WHERE admin_id=$1 AND purpose=$2
    AND consumed_at IS NULL AND revoked_at IS NULL`,
    [input.adminId, input.purpose],
  );
  const id = randomUUID();
  const token = randomToken();
  await tx.query(
    `INSERT INTO action_tokens(id,admin_id,purpose,token_hash,created_at,expires_at)
    VALUES($1,$2,$3,$4,clock_timestamp(),clock_timestamp()+$5*interval '1 millisecond')`,
    [id, input.adminId, input.purpose, tokenDigest(token), input.ttlMs],
  );
  return { id, token };
}
