import { randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Account, CreateAccountInput, UpdateAccountInput } from '../../types.ts';

interface AccountRow extends QueryResultRow {
  id: string;
  email: string;
  display_name: string | null;
  role_id: string;
  status: Account['status'];
  version: number;
  activated: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
  delivery_id: string | null;
  delivery_status: NonNullable<Account['invitationDelivery']>['status'];
  delivery_created_at: Date;
  delivery_finished_at: Date | null;
}

export const accountProjection = `a.id,a.email,a.display_name,a.role_id,a.status,a.version,
  a.last_login_at,a.created_at,a.updated_at,
  EXISTS(SELECT 1 FROM credentials c WHERE c.admin_id=a.id) AS activated,
  d.id AS delivery_id,d.status AS delivery_status,d.created_at AS delivery_created_at,
  d.finished_at AS delivery_finished_at`;

export const accountDeliveryJoin = `LEFT JOIN LATERAL (
  SELECT e.id,e.status,e.created_at,e.finished_at FROM email_deliveries e
  JOIN action_tokens t ON t.id=e.action_token_id
  WHERE t.admin_id=a.id AND t.purpose='invitation'
  ORDER BY e.created_at DESC,e.id DESC LIMIT 1
) d ON true`;

export function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    roleId: row.role_id,
    status: row.status,
    version: row.version,
    activation: row.activated ? 'activated' : 'pending',
    lastLoginAt: row.last_login_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    invitationDelivery:
      row.delivery_id === null
        ? null
        : {
            id: row.delivery_id,
            status: row.delivery_status,
            createdAt: row.delivery_created_at.toISOString(),
            finishedAt: row.delivery_finished_at?.toISOString() ?? null,
          },
  };
}

export async function findAccount(tx: SqlExecutor, id: string): Promise<Account | null> {
  const result = await tx.query<AccountRow>(
    `SELECT ${accountProjection} FROM admins a ${accountDeliveryJoin} WHERE a.id=$1`,
    [id],
  );
  return result.rows[0] ? mapAccount(result.rows[0]) : null;
}

export async function insertAccount(tx: SqlExecutor, input: CreateAccountInput): Promise<Account> {
  const id = randomUUID();
  await tx.query(
    'INSERT INTO admins(id,email,display_name,role_id,created_at,updated_at) VALUES($1,$2,$3,$4,clock_timestamp(),clock_timestamp())',
    [id, input.email, input.displayName, input.roleId],
  );
  const account = await findAccount(tx, id);
  if (!account) fail('internal_error');
  return account;
}

export async function updateAccountRow(
  tx: SqlExecutor,
  input: UpdateAccountInput,
): Promise<Account> {
  const current = await findAccount(tx, input.id);
  if (!current) fail('not_found');
  if (current.version !== input.version) fail('version_conflict');
  const next = { ...current, ...input };
  if (current.status === 'archived' && next.status !== 'archived') fail('invalid_input');
  if (unchanged(current, next)) return current;
  const updated = await tx.query(
    `UPDATE admins SET display_name=$2,role_id=$3,status=$4,
    version=version+1,updated_at=clock_timestamp() WHERE id=$1 AND version=$5`,
    [input.id, next.displayName, next.roleId, next.status, input.version],
  );
  if (updated.rowCount !== 1) fail('version_conflict');
  if (current.roleId !== next.roleId || current.status !== next.status)
    await revokeAccount(tx, input.id);
  const account = await findAccount(tx, input.id);
  if (!account) fail('internal_error');
  return account;
}

function unchanged(current: Account, next: Account): boolean {
  return (
    current.displayName === next.displayName &&
    current.roleId === next.roleId &&
    current.status === next.status
  );
}

export async function revokeAccount(tx: SqlExecutor, adminId: string): Promise<void> {
  await tx.query(
    'UPDATE sessions SET revoked_at=clock_timestamp() WHERE admin_id=$1 AND revoked_at IS NULL',
    [adminId],
  );
  await tx.query(
    `UPDATE action_tokens SET revoked_at=clock_timestamp()
    WHERE admin_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL`,
    [adminId],
  );
}

export async function queryAccounts(
  tx: SqlExecutor,
  options: {
    where: string;
    values: unknown[];
    order: string;
    limit: number;
    offset: number;
  },
): Promise<{ rows: Account[]; total: number }> {
  const { where, values, order, limit, offset } = options;
  const count = await tx.query<{ total: string }>(
    `SELECT count(*) AS total FROM admins a WHERE ${where}`,
    values,
  );
  const result = await tx.query<AccountRow>(
    `SELECT ${accountProjection} FROM admins a
    ${accountDeliveryJoin} WHERE ${where} ORDER BY ${order},a.id
    LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );
  return { rows: result.rows.map(mapAccount), total: Number(count.rows[0]?.total ?? 0) };
}
