import { fail } from '@new-cms/cms/platform/contracts';
import { isJsonValue } from '../../fields/json-value.ts';
import { contextFor, matchingSql } from './query-documents.ts';
import { groupProjection } from './group-values.ts';
import type { QueryOptions } from './query-documents.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { JsonValue } from '../../definition.ts';

export interface DistinctOptions extends QueryOptions {
  field: string;
  order: 'asc' | 'desc';
}

export async function queryDistinct(tx: SqlExecutor, input: DistinctOptions) {
  if (
    !Number.isSafeInteger(input.query.page) ||
    input.query.page < 1 ||
    !Number.isSafeInteger(input.query.pageSize) ||
    input.query.pageSize < 1 ||
    input.query.pageSize > input.limits.maxPageSize ||
    !Number.isSafeInteger(input.query.page * input.query.pageSize)
  )
    fail('invalid_input');
  const context = contextFor(input);
  const statement = matchingSql(context, input.where, {
    rowNumber: false,
    sort: false,
    selectProjection: (scope) => `${groupProjection(scope, input.field)} AS value`,
  });
  const offset = statement.values.push((input.query.page - 1) * input.query.pageSize);
  const limit = statement.values.push(input.query.pageSize);
  const order = input.order === 'asc' ? 'ASC NULLS LAST' : 'DESC NULLS FIRST';
  const result = await tx.query<{ rows: unknown; total: string }>(
    `WITH matches AS MATERIALIZED(${statement.sql}),distinct_values AS MATERIALIZED(SELECT DISTINCT value FROM matches),ranked AS(SELECT value,row_number() OVER(ORDER BY value ${order}) AS ordinal FROM distinct_values) SELECT (SELECT count(*)::text FROM distinct_values) AS total,coalesce((SELECT jsonb_agg(value ORDER BY ordinal) FROM ranked WHERE ordinal>$${offset} AND ordinal<=$${offset}+$${limit}),'[]'::jsonb) AS rows`,
    statement.values,
  );
  const [page] = result.rows;
  const total = Number(page?.total);
  if (
    !page ||
    !Array.isArray(page.rows) ||
    !page.rows.every(isJsonValue) ||
    !Number.isSafeInteger(total) ||
    total < page.rows.length
  )
    fail('temporarily_unavailable');
  const rows: JsonValue[] = page.rows;
  if (Buffer.byteLength(JSON.stringify(rows)) > input.limits.maxResponseBytes)
    fail('capacity_exceeded');
  return { rows, total, page: input.query.page, pageSize: input.query.pageSize };
}
