import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import {
  catalogOperations,
  seedGlobalBinding,
  storeOperation,
} from './adapters/postgres/catalog-store.ts';
import type { CatalogRuntime, InitialCollectionPermission } from './types.ts';
import { permissionCode } from './validation.ts';
import { seedInitialCollectionPermissions } from './initial-permissions.ts';

const operationSchema = z.strictObject({
  id: z.string().min(1).max(128),
  module: z.string().min(1).max(32),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().min(1).max(255),
  access: z.enum(['public', 'authenticated', 'security', 'permission']),
  scopeKind: z.enum(['global', 'collection']),
  bindingConfigurable: z.boolean(),
  defaultPermission: permissionCode.optional(),
  idempotency: z.literal('required').optional(),
  successStatus: z.union([z.literal(200), z.literal(201), z.literal(202)]).optional(),
});

export function operationRegistry(operations: readonly OperationDefinition[]) {
  const registry = new Map<string, OperationDefinition>();
  const routes = new Set<string>();
  for (const raw of operations) {
    const result = operationSchema.safeParse(raw);
    if (!result.success) fail('invalid_input');
    const operation = result.data;
    const route = `${operation.method}:${operation.path}`;
    if (registry.has(operation.id) || routes.has(route)) fail('invalid_input');
    if (operation.bindingConfigurable && operation.access !== 'permission') fail('invalid_input');
    if (
      operation.defaultPermission &&
      (operation.access !== 'permission' || operation.scopeKind !== 'global')
    )
      fail('invalid_input');
    const { defaultPermission, idempotency, successStatus, ...definition } = operation;
    registry.set(operation.id, {
      ...definition,
      ...(defaultPermission ? { defaultPermission } : {}),
      ...(idempotency ? { idempotency } : {}),
      ...(successStatus ? { successStatus } : {}),
    });
    routes.add(route);
  }
  return registry;
}

function compatible(current: OperationDefinition, stored: OperationDefinition | undefined) {
  return (
    stored !== undefined &&
    current.access === stored.access &&
    current.scopeKind === stored.scopeKind &&
    current.bindingConfigurable === stored.bindingConfigurable
  );
}

export function createCatalog(
  runtime: CatalogRuntime,
  initialPermissions: readonly InitialCollectionPermission[] = [],
) {
  return {
    reconcile: () =>
      securityTransaction(runtime.database, runtime.policy, {
        mode: 'exclusive',
        async work(tx) {
          const previous = new Map(
            (await catalogOperations(tx)).map((operation) => [operation.id, operation]),
          );
          for (const operation of runtime.operationMap.values()) {
            const stored = previous.get(operation.id);
            if (stored && !compatible(operation, stored)) fail('temporarily_unavailable');
            if (
              !stored &&
              operation.access === 'permission' &&
              operation.scopeKind === 'global' &&
              !operation.defaultPermission
            )
              fail('temporarily_unavailable');
            await storeOperation(tx, operation);
            if (!stored) await seedGlobalBinding(tx, operation);
          }
          if (previous.size === 0)
            await seedInitialCollectionPermissions(tx, runtime, initialPermissions);
        },
      }),
    verifyReady: (signal?: AbortSignal) =>
      runtime.database.transaction(async (tx) => {
        const stored = new Map(
          (await catalogOperations(tx)).map((operation) => [operation.id, operation]),
        );
        for (const operation of runtime.operationMap.values()) {
          if (!compatible(operation, stored.get(operation.id))) fail('temporarily_unavailable');
        }
      }, signal),
  };
}
