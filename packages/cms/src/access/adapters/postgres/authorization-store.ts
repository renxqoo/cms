import type { SqlExecutor } from '@new-cms/database/client';
import type { Scope } from '@new-cms/cms/platform/contracts';

export async function effectiveSuperCount(tx: SqlExecutor) {
  const result = await tx.query<{ count: string }>(
    `SELECT count(*) FROM admins a JOIN credentials c ON c.admin_id=a.id JOIN roles r ON r.id=a.role_id WHERE a.status='active' AND r.status='active' AND r.is_super`,
  );
  return Number(result.rows[0]?.count);
}

export async function permissionIds(tx: SqlExecutor, roleId: string) {
  const result = await tx.query<{ id: string }>(
    'SELECT permission_id AS id FROM role_permissions WHERE role_id=$1 ORDER BY permission_id',
    [roleId],
  );
  return result.rows.map((row) => row.id);
}

export async function requireActivePermissions(tx: SqlExecutor, ids: string[]) {
  const result = await tx.query<{ count: string }>(
    "SELECT count(*) FROM permissions WHERE id=ANY($1::uuid[]) AND status='active'",
    [ids],
  );
  return Number(result.rows[0]?.count) === ids.length;
}

export async function replacePermissions(
  tx: SqlExecutor,
  input: { roleId: string; permissionIds: string[] },
) {
  await tx.query('DELETE FROM role_permissions WHERE role_id=$1', [input.roleId]);
  await tx.query(
    'INSERT INTO role_permissions(role_id,permission_id) SELECT $1,id FROM unnest($2::uuid[]) AS id',
    [input.roleId, input.permissionIds],
  );
}

export async function roleCounts(tx: SqlExecutor, id: string) {
  const result = await tx.query<{ adminCount: string; permissionCount: string }>(
    'SELECT (SELECT count(*) FROM admins WHERE role_id=$1) AS "adminCount",(SELECT count(*) FROM role_permissions WHERE role_id=$1) AS "permissionCount"',
    [id],
  );
  return {
    adminCount: Number(result.rows[0]?.adminCount),
    permissionCount: Number(result.rows[0]?.permissionCount),
  };
}

export async function bindingPermission(
  tx: SqlExecutor,
  input: { operationId: string; scope: Scope },
) {
  const result = await tx.query<{ permissionId: string; status: string }>(
    `SELECT p.id AS "permissionId",p.status FROM endpoint_bindings b JOIN permissions p ON p.id=b.permission_id WHERE b.operation_id=$1 AND b.scope_kind=$2 AND b.collection_key IS NOT DISTINCT FROM $3`,
    [input.operationId, input.scope.scopeKind, input.scope.collectionKey],
  );
  return result.rows[0] ?? null;
}

export async function grantedPermissionIds(tx: SqlExecutor, roleId: string) {
  const result = await tx.query<{ id: string }>(
    "SELECT p.id FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id WHERE rp.role_id=$1 AND p.status='active'",
    [roleId],
  );
  return new Set(result.rows.map((row) => row.id));
}
