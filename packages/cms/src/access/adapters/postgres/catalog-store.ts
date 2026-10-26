import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { InitialCollectionPermission } from '../../types.ts';
import { enforceCapacity } from './resource-store.ts';

export async function seedCollectionPermission(
  tx: SqlExecutor,
  input: InitialCollectionPermission,
  maximum: number,
) {
  const result = await tx.query<{
    id: string;
    scopeKind: string;
    collectionKey: string | null;
    status: string;
  }>(
    'SELECT id,scope_kind AS "scopeKind",collection_key AS "collectionKey",status FROM permissions WHERE code=$1',
    [input.code],
  );
  let [permission] = result.rows;
  if (!permission) {
    await enforceCapacity(tx, { table: 'permissions', maximum });
    permission = {
      id: randomUUID(),
      scopeKind: 'collection',
      collectionKey: input.collectionKey,
      status: 'active',
    };
    await tx.query(
      `INSERT INTO permissions(id,code,name,scope_kind,collection_key) VALUES($1,$2,$3,'collection',$4)`,
      [permission.id, input.code, input.name, input.collectionKey],
    );
  }
  if (permission?.scopeKind !== 'collection' || permission.collectionKey !== input.collectionKey)
    fail('scope_mismatch');
  if (permission.status !== 'active') fail('invalid_input');
  await tx.query(
    `INSERT INTO endpoint_bindings(id,operation_id,scope_kind,collection_key,permission_id)
     SELECT id,operation,'collection',$3,$4 FROM unnest($1::uuid[],$2::text[]) AS seed(id,operation)`,
    [
      input.operationIds.map(() => randomUUID()),
      input.operationIds,
      input.collectionKey,
      permission.id,
    ],
  );
  return permission.id;
}

export async function catalogOperations(tx: SqlExecutor) {
  const result = await tx.query<OperationDefinition>(
    'SELECT operation_id AS id,module,method,path,access_kind AS access,scope_kind AS "scopeKind",binding_configurable AS "bindingConfigurable" FROM operation_catalog',
  );
  return result.rows;
}

export async function storeOperation(tx: SqlExecutor, operation: OperationDefinition) {
  await tx.query(
    `INSERT INTO operation_catalog(operation_id,module,method,path,access_kind,scope_kind,binding_configurable) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(operation_id) DO UPDATE SET module=excluded.module,method=excluded.method,path=excluded.path,updated_at=clock_timestamp()`,
    [
      operation.id,
      operation.module,
      operation.method,
      operation.path,
      operation.access,
      operation.scopeKind,
      operation.bindingConfigurable,
    ],
  );
}

export async function seedGlobalBinding(tx: SqlExecutor, operation: OperationDefinition) {
  if (
    operation.access !== 'permission' ||
    operation.scopeKind !== 'global' ||
    !operation.defaultPermission
  )
    return;
  await tx.query(
    `INSERT INTO permissions(id,code,name,scope_kind,collection_key) VALUES($1,$2,$2,'global',NULL) ON CONFLICT(code) DO NOTHING`,
    [randomUUID(), operation.defaultPermission],
  );
  const permission = await tx.query<{ id: string; scopeKind: string }>(
    'SELECT id,scope_kind AS "scopeKind" FROM permissions WHERE code=$1',
    [operation.defaultPermission],
  );
  const [row] = permission.rows;
  if (row?.scopeKind !== 'global') fail('scope_mismatch');
  await tx.query(
    `INSERT INTO endpoint_bindings(id,operation_id,scope_kind,collection_key,permission_id) VALUES($1,$2,'global',NULL,$3) ON CONFLICT DO NOTHING`,
    [randomUUID(), operation.id, row.id],
  );
}
