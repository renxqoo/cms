import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Binding, Page, Permission } from '../../types.ts';
import type { RecoveryInput } from '../../recovery/input.ts';
import type { RecoveryEndpoint } from '../../recovery/contracts.ts';
import { projectResource, resourceColumns } from './resource-projections.ts';

function column(name: string) {
  return name.replaceAll(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function conditions(input: RecoveryInput) {
  const values: unknown[] = [];
  const predicates: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    if (key === 'resource' || key === 'page' || key === 'pageSize' || value === undefined) continue;
    values.push(value);
    predicates.push(`${column(key)}=$${values.length}`);
  }
  return { values, sql: predicates.length > 0 ? predicates.join(' AND ') : 'true' };
}

export async function recoveryResources(
  tx: SqlExecutor,
  input: Exclude<RecoveryInput, { resource: 'endpoints' }>,
): Promise<Page<Binding | Permission>> {
  const table = input.resource === 'bindings' ? 'endpoint_bindings' : 'permissions';
  const projection = resourceColumns[table].map((name) => `${column(name)} AS "${name}"`).join(',');
  const where = conditions(input);
  const values = [...where.values, input.pageSize, (input.page - 1) * input.pageSize];
  const result = await tx.query<Record<string, unknown>>(
    `WITH filtered AS MATERIALIZED (SELECT ${projection} FROM ${table} WHERE ${where.sql}),
     selected AS (SELECT * FROM filtered ORDER BY "createdAt" DESC,id DESC LIMIT $${values.length - 1} OFFSET $${values.length}),
     counted AS (SELECT count(*)::text AS total FROM filtered)
     SELECT selected.*,counted.total FROM counted LEFT JOIN selected ON true ORDER BY selected."createdAt" DESC,selected.id DESC`,
    values,
  );
  const total = Number(result.rows[0]?.['total']);
  if (!Number.isSafeInteger(total) || total < 0) fail('capacity_exceeded');
  return {
    rows: result.rows.filter((row) => row['id'] !== null).map((row) => projectResource(table, row)),
    total,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export async function recoveryEndpointBindings(tx: SqlExecutor, rows: RecoveryEndpoint[]) {
  if (rows.length === 0) return new Map<string, Binding>();
  const projection = resourceColumns.endpoint_bindings
    .map((name) => `b.${column(name)} AS "${name}"`)
    .join(',');
  const result = await tx.query<Record<string, unknown>>(
    `SELECT ${projection} FROM unnest($1::text[],$2::text[],$3::text[]) AS selected(operation_id,scope_kind,collection_key)
     JOIN endpoint_bindings b ON b.operation_id=selected.operation_id AND b.scope_kind=selected.scope_kind AND b.collection_key IS NOT DISTINCT FROM selected.collection_key`,
    [
      rows.map((row) => row.operationId),
      rows.map((row) => row.scopeKind),
      rows.map((row) => row.collectionKey),
    ],
  );
  return new Map(
    result.rows.map((row) => {
      const binding = projectResource('endpoint_bindings', row);
      return [JSON.stringify([binding.operationId, binding.collectionKey]), binding];
    }),
  );
}
