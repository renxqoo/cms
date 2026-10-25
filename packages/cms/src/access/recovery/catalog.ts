import type { SqlExecutor } from '@new-cms/database/client';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import type { AccessRuntime } from '../types.ts';
import type { RecoveryEndpoint } from './contracts.ts';
import type { RecoveryInput } from './input.ts';
import { recoveryEndpointBindings } from '../adapters/postgres/recovery-store.ts';

type EndpointQuery = Extract<RecoveryInput, { resource: 'endpoints' }>;

function scopesFor(runtime: AccessRuntime, query: EndpointQuery) {
  return runtime.collectionKeys
    .filter((key) => query.collectionKey === undefined || key === query.collectionKey)
    .toSorted();
}

function endpoint(operation: OperationDefinition, collectionKey: string | null): RecoveryEndpoint {
  return {
    operationId: operation.id,
    module: operation.module,
    method: operation.method,
    path: operation.path,
    accessKind: operation.access,
    bindingConfigurable: operation.bindingConfigurable,
    scopeKind: operation.scopeKind,
    collectionKey,
    binding: null,
  };
}

function catalogPage(runtime: AccessRuntime, query: EndpointQuery) {
  const operations = [...runtime.operationMap.values()]
    .filter(
      (operation) =>
        (query.operationId === undefined || operation.id === query.operationId) &&
        (query.module === undefined || operation.module === query.module) &&
        (query.scopeKind === undefined || operation.scopeKind === query.scopeKind),
    )
    .toSorted((a, b) => a.id.localeCompare(b.id));
  const collections = scopesFor(runtime, query);
  const offset = (query.page - 1) * query.pageSize;
  const rows: RecoveryEndpoint[] = [];
  let total = 0;
  for (const operation of operations) {
    const size = operation.scopeKind === 'global' ? 1 : collections.length;
    const start = Math.max(0, offset - total);
    const end = Math.min(size, offset - total + query.pageSize);
    for (let index = start; index < end; index++)
      rows.push(
        endpoint(operation, operation.scopeKind === 'global' ? null : (collections[index] ?? null)),
      );
    total += size;
  }
  return { resource: query.resource, rows, total, page: query.page, pageSize: query.pageSize };
}

export async function recoveryCatalog(
  tx: SqlExecutor,
  runtime: AccessRuntime,
  query: EndpointQuery,
) {
  const result = catalogPage(runtime, query);
  const bindings = await recoveryEndpointBindings(tx, result.rows);
  for (const row of result.rows) {
    const binding = bindings.get(JSON.stringify([row.operationId, row.collectionKey]));
    if (binding)
      row.binding = {
        id: binding.id,
        permissionId: binding.permissionId,
        version: binding.version,
      };
  }
  return result;
}
