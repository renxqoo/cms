import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits } from '../../definition.ts';
import type { ContentMapping, StoredPage } from '../../model.ts';
import type { CollectionsQueryInput } from './store-contract.ts';
import { contextFor, querySql, decodeRows } from './query-documents.ts';
import type { RawQueryRow } from './query-documents.ts';
import { metadataColumns } from './query-context.ts';

function sourceSql(
  input: CollectionsQueryInput & { mapping: ContentMapping; limits: ContentLimits },
): { sql: string; values: unknown[] } {
  const values: unknown[] = [];
  const budget = { nodes: 0 };
  const statements = input.collections.map((source) => {
    const context = contextFor(
      {
        ...input,
        ...source,
        query: {
          ...source.query,
          page: 1,
          pageSize: input.page * input.pageSize,
          sort: input.sort,
          select: [],
        },
      },
      budget,
    );
    const statement = querySql(context, source.where);
    const offset = values.length;
    values.push(...statement.values);
    return `SELECT * FROM (${statement.sql.replaceAll(/\$(\d+)/g, (_match, index: string) => `$${Number(index) + offset}`)}) AS source`;
  });
  const order = [
    ...input.sort.map((sort) => `"${sort.field}" ${sort.order.toUpperCase()} NULLS LAST`),
    'id ASC',
  ].join(',');
  values.push(input.pageSize, (input.page - 1) * input.pageSize);
  const sql = `WITH resource_matches AS MATERIALIZED (${statements.join(' UNION ALL ')}) SELECT (SELECT COALESCE(jsonb_agg(page),'[]'::jsonb) FROM (SELECT * FROM resource_matches ORDER BY ${order} LIMIT $${values.length - 1} OFFSET $${values.length}) page) AS rows,(SELECT COALESCE(sum(total),0)::text FROM (SELECT "collectionId",max(total::bigint) AS total FROM resource_matches GROUP BY "collectionId") counts) AS total`;
  return { sql, values };
}
export async function queryCollections(
  tx: SqlExecutor,
  input: CollectionsQueryInput & { mapping: ContentMapping; limits: ContentLimits },
): Promise<StoredPage> {
  validateCollectionsQuery(input);
  if (input.collections.length === 0)
    return { rows: [], total: 0, page: input.page, pageSize: input.pageSize };
  const statement = sourceSql(input);
  const result = await tx.query<{ rows: RawQueryRow[]; total: string }>(
    statement.sql,
    statement.values,
  );
  const [page] = result.rows;
  if (!page) fail('temporarily_unavailable');
  const views = new Map<string, StoredPage['rows'][number]>();
  for (const source of input.collections) {
    const { id } = input.mapping.get(source.collection).definition;
    const raw = page.rows.filter((row) => row.collectionId === id);
    if (raw.length === 0) continue;
    for (const row of await decodeRows(tx, { ...input, ...source }, raw))
      views.set(row.document.id, row);
  }
  const rows = page.rows.map((row) => {
    const value = views.get(row.id);
    if (!value) fail('temporarily_unavailable');
    return value;
  });
  if (Buffer.byteLength(JSON.stringify(rows)) > input.limits.maxResponseBytes)
    fail('capacity_exceeded');
  return { rows, total: Number(page.total), page: input.page, pageSize: input.pageSize };
}

function validateCollectionsQuery(input: CollectionsQueryInput & { limits: ContentLimits }): void {
  if (
    !Number.isSafeInteger(input.page) ||
    input.page < 1 ||
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > input.limits.maxPageSize ||
    !Number.isSafeInteger(input.page * input.pageSize)
  )
    fail('invalid_input');
  if (
    input.sort.some(
      (sort) =>
        !Object.hasOwn(metadataColumns, sort.field) || !['asc', 'desc'].includes(sort.order),
    )
  )
    fail('invalid_input');
  if (
    new Set(input.collections.map((source) => source.collection)).size !== input.collections.length
  )
    fail('invalid_input');
  if (input.collections.length > input.limits.maxExpandNodes) fail('capacity_exceeded');
}
