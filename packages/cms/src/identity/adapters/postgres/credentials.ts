import type { QueryResultRow } from 'pg';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AccountStatus } from '../../types.ts';

export interface CredentialRow extends QueryResultRow {
  admin_id: string;
  password_hash: string | null;
  version: number | null;
  status: AccountStatus;
}

export async function credentialByEmail(
  tx: SqlExecutor,
  email: string,
): Promise<CredentialRow | null> {
  const result = await tx.query<CredentialRow>(
    `SELECT a.id AS admin_id,a.status,c.password_hash,c.version
    FROM admins a LEFT JOIN credentials c ON c.admin_id=a.id WHERE a.email=$1`,
    [email],
  );
  return result.rows[0] ?? null;
}

export async function credentialById(
  tx: SqlExecutor,
  adminId: string,
): Promise<CredentialRow | null> {
  const result = await tx.query<CredentialRow>(
    `SELECT a.id AS admin_id,a.status,c.password_hash,c.version
    FROM admins a LEFT JOIN credentials c ON c.admin_id=a.id WHERE a.id=$1`,
    [adminId],
  );
  return result.rows[0] ?? null;
}

export async function writeCredential(
  tx: SqlExecutor,
  input: { adminId: string; hash: string },
): Promise<void> {
  await tx.query(
    `INSERT INTO credentials(admin_id,password_hash,password_changed_at,created_at,updated_at)
    VALUES($1,$2,clock_timestamp(),clock_timestamp(),clock_timestamp()) ON CONFLICT(admin_id) DO UPDATE
    SET password_hash=excluded.password_hash,version=credentials.version+1,
    password_changed_at=clock_timestamp(),updated_at=clock_timestamp()`,
    [input.adminId, input.hash],
  );
}
