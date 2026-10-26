import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { appendAudit } from '@new-cms/cms/audit/composition';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { CatalogRuntime, InitialCollectionPermission } from './types.ts';
import { code, name, parse, permissionCode } from './validation.ts';
import { seedCollectionPermission } from './adapters/postgres/catalog-store.ts';

const initialPermissionsSchema = z.array(
  z.strictObject({
    collectionKey: code,
    code: permissionCode,
    name,
    operationIds: z.array(z.string().min(1).max(128)).min(1),
  }),
);

function validatePermissions(runtime: CatalogRuntime, raw: readonly InitialCollectionPermission[]) {
  const permissions = parse(initialPermissionsSchema, raw);
  const keys = new Set<string>();
  const codes = new Set<string>();
  for (const permission of permissions) {
    if (keys.has(permission.collectionKey) || codes.has(permission.code)) fail('invalid_input');
    keys.add(permission.collectionKey);
    codes.add(permission.code);
    if (!runtime.collectionKeys.includes(permission.collectionKey)) fail('invalid_scope');
    if (new Set(permission.operationIds).size !== permission.operationIds.length)
      fail('invalid_input');
    for (const id of permission.operationIds) {
      const operation = runtime.operationMap.get(id);
      if (
        operation?.access !== 'permission' ||
        operation.scopeKind !== 'collection' ||
        !operation.bindingConfigurable
      )
        fail('invalid_input');
    }
  }
  return permissions;
}

export async function seedInitialCollectionPermissions(
  tx: SqlExecutor,
  runtime: CatalogRuntime,
  raw: readonly InitialCollectionPermission[],
) {
  for (const permission of validatePermissions(runtime, raw)) {
    const id = await seedCollectionPermission(tx, permission, runtime.policy.maxPermissions);
    await appendAudit(
      tx,
      {
        actorKind: 'system',
        operationId: 'access.initializeCollectionPermissions',
        targetType: 'permission',
        targetId: id,
        requestId: randomUUID(),
        detail: { collectionKey: permission.collectionKey, operationIds: permission.operationIds },
      },
      runtime.policy,
    );
  }
}
