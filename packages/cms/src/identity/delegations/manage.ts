import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { GrantRow } from './types.ts';
import { credentialView } from './grants.ts';

export interface ManagementScope {
  adminId: string;
  delegationId: string | null;
}

const subtree = `WITH RECURSIVE visible AS (
 SELECT id FROM credential_grants WHERE admin_id=$1 AND ($2::uuid IS NULL OR id=$2)
 UNION SELECT g.id FROM credential_grants g JOIN visible v ON g.parent_id=v.id WHERE g.admin_id=$1
)`;

export async function listCredentials(
  tx: SqlExecutor,
  input: ManagementScope & { page: number; pageSize: number; kind?: string | undefined },
) {
  const values = [input.adminId, input.delegationId, input.kind ?? null];
  const where = 'g.id IN(SELECT id FROM visible) AND ($3::text IS NULL OR g.kind=$3)';
  const count = await tx.query<{ total: string }>(
    `${subtree} SELECT count(*) AS total FROM credential_grants g WHERE ${where}`,
    values,
  );
  const result = await tx.query<GrantRow>(
    `${subtree} SELECT g.*,c.name AS client_name,g.revoked_at IS NULL AND g.expires_at>clock_timestamp() AS active FROM credential_grants g LEFT JOIN oauth_clients c ON c.id=g.client_id WHERE ${where} ORDER BY g.created_at DESC,g.id DESC LIMIT $4 OFFSET $5`,
    [...values, input.pageSize, (input.page - 1) * input.pageSize],
  );
  return {
    rows: result.rows.map(credentialView),
    total: Number(count.rows[0]?.total ?? 0),
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function managedCredential(
  tx: SqlExecutor,
  input: ManagementScope & { id: string },
): Promise<void> {
  const found = await tx.query(`${subtree} SELECT id FROM visible WHERE id=$3`, [
    input.adminId,
    input.delegationId,
    input.id,
  ]);
  if (found.rowCount !== 1) fail('not_found');
}

export async function revokeGrant(tx: SqlExecutor, id: string): Promise<number> {
  const result = await tx.query(
    `WITH RECURSIVE revoked AS (SELECT id FROM credential_grants WHERE id=$1 UNION SELECT g.id FROM credential_grants g JOIN revoked r ON g.parent_id=r.id)
     UPDATE credential_grants SET revoked_at=clock_timestamp() WHERE id IN(SELECT id FROM revoked) AND revoked_at IS NULL`,
    [id],
  );
  return result.rowCount ?? 0;
}

export async function revokeClientGrants(
  tx: SqlExecutor,
  input: ManagementScope & { clientId: string },
): Promise<number> {
  const rows = await tx.query<{ id: string }>(
    `${subtree} SELECT g.id FROM credential_grants g WHERE g.id IN(SELECT id FROM visible) AND g.client_id=$3 AND g.revoked_at IS NULL`,
    [input.adminId, input.delegationId, input.clientId],
  );
  let revoked = 0;
  for (const row of rows.rows) revoked += await revokeGrant(tx, row.id);
  return revoked;
}
