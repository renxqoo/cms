import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { ContentLimits } from '../../definition.ts';
import type { ContentMapping, StoredJoinPage } from '../../model.ts';
import type { JoinedQueryInput } from './store-contract.ts';
import { contextFor, matchingSql, decodeRows } from './query-documents.ts';
import type { RawQueryRow } from './query-documents.ts';

type Input = JoinedQueryInput & { mapping: ContentMapping; limits: ContentLimits };
interface RawPage {
  key: string;
  rows: RawQueryRow[];
  total?: string;
}

function sourceStatements(input: Input) {
  const values: unknown[] = [];
  const budget = { nodes: 0 };
  let sorts: readonly ('asc' | 'desc')[] | undefined;
  const statements: string[] = [];
  for (const group of input.groups)
    for (const source of group.collections) {
      const context = contextFor(
        { ...input, ...source, query: { ...source.query, sort: input.sort } },
        budget,
      );
      const statement = matchingSql(context, source.where, {
        sortProjection: true,
        rowNumber: false,
      });
      if (sorts && JSON.stringify(sorts) !== JSON.stringify(statement.sort)) fail('invalid_input');
      sorts = statement.sort;
      const offset = values.length;
      values.push(...statement.values, group.key);
      const sql = statement.sql.replaceAll(
        /\$(\d+)/g,
        (_match, index: string) => `$${Number(index) + offset}`,
      );
      statements.push(
        `SELECT source.*,$${values.length}::text AS "_join_group" FROM (${sql}) source`,
      );
    }
  return { values, statements, sorts: sorts ?? [] };
}

function unionStatement(input: Input) {
  const { values, statements, sorts } = sourceStatements(input);
  const order = [
    ...sorts.map((direction, index) => `"sort_${index}" ${direction.toUpperCase()} NULLS LAST`),
    'id ASC',
  ].join(',');
  values.push(
    input.groups.map((group) => group.key),
    input.groups.map((group) => pageFor(input, group.key).page),
    input.groups.map((group) => pageFor(input, group.key).pageSize),
  );
  const offset = '((expected.page-1)*expected.page_size)';
  const limit = '(expected.page_size+1)';
  const count = input.count
    ? ',(SELECT count(*)::text FROM joined_matches m WHERE m."_join_group"=expected.key) AS total'
    : '';
  const omitted = [
    ...sorts.map((_value, index) => `'sort_${index}'`),
    "'_join_group'",
    "'_join_ordinal'",
  ].join(',');
  return {
    sql: `WITH joined_matches AS MATERIALIZED(${statements.join(' UNION ALL ')}),joined_ranked AS(SELECT *,row_number() OVER(PARTITION BY "_join_group" ORDER BY ${order}) AS "_join_ordinal" FROM joined_matches) SELECT expected.key,coalesce((SELECT jsonb_agg(to_jsonb(p)-ARRAY[${omitted}]::text[] ORDER BY "_join_ordinal") FROM joined_ranked p WHERE p."_join_group"=expected.key AND p."_join_ordinal">${offset} AND p."_join_ordinal"<=${offset}+${limit}),'[]'::jsonb) AS rows${count} FROM unnest($${values.length - 2}::text[],$${values.length - 1}::bigint[],$${values.length}::bigint[]) expected(key,page,page_size)`,
    values,
  };
}

async function decodedRows(tx: SqlExecutor, input: Input, pages: RawPage[]) {
  const rows = new Map<string, StoredJoinPage['rows'][number]>();
  const sources = new Map(
    input.groups.flatMap((group) => group.collections).map((source) => [source.collection, source]),
  );
  const raw = pages.flatMap((page) => page.rows.slice(0, pageFor(input, page.key).pageSize));
  for (const source of sources.values()) {
    const { id } = input.mapping.get(source.collection).definition;
    const sourceRows = [
      ...new Map(raw.filter((row) => row.collectionId === id).map((row) => [row.id, row])).values(),
    ];
    if (sourceRows.length === 0) continue;
    for (const row of await decodeRows(tx, { ...input, ...source }, sourceRows))
      rows.set(row.document.id, row);
  }
  return rows;
}

function validateInput(input: Input): void {
  validatePage(input.page, input.pageSize, input.limits);
  if (input.sort.length > input.limits.maxQueryNodes) fail('invalid_input');
  if (
    input.groups.length > input.limits.maxExpandNodes ||
    input.groups.some((group) => group.collections.length > input.limits.maxExpandNodes)
  )
    fail('capacity_exceeded');
  if (input.maxRows !== undefined && (!Number.isSafeInteger(input.maxRows) || input.maxRows < 0))
    fail('invalid_input');
  validateGroups(input);
}

function validateGroups(input: Input) {
  if (
    new Set(input.groups.map((group) => group.key)).size !== input.groups.length ||
    input.groups.some(
      (group) =>
        new Set(group.collections.map((source) => source.collection)).size !==
        group.collections.length,
    )
  )
    fail('invalid_input');
  const contexts = new Map<string, string>();
  for (const group of input.groups) {
    const paging = pageFor(input, group.key);
    validatePage(paging.page, paging.pageSize, input.limits);
    if (group.copies !== undefined && (!Number.isSafeInteger(group.copies) || group.copies < 1))
      fail('invalid_input');
    for (const source of group.collections) {
      const context = JSON.stringify([
        source.query.locale,
        source.query.fallback,
        source.query.mode,
        source.query.select ?? null,
      ]);
      const known = contexts.get(source.collection);
      if (known !== undefined && known !== context) fail('invalid_input');
      contexts.set(source.collection, context);
    }
  }
}

function buildPages(
  input: Input,
  pages: RawPage[],
  decoded: ReadonlyMap<string, StoredJoinPage['rows'][number]>,
) {
  const result = new Map<string, StoredJoinPage>();
  for (const page of pages) {
    const paging = pageFor(input, page.key);
    const rows = page.rows.slice(0, pageFor(input, page.key).pageSize).map((row) => {
      const value = decoded.get(row.id);
      if (!value) fail('temporarily_unavailable');
      return value;
    });
    const total = input.count ? Number(page.total) : undefined;
    if (total !== undefined && (!Number.isSafeInteger(total) || total < rows.length))
      fail('temporarily_unavailable');
    result.set(page.key, {
      rows,
      page: paging.page,
      pageSize: paging.pageSize,
      hasNextPage: page.rows.length > paging.pageSize,
      ...(total === undefined ? {} : { total }),
    });
  }
  if (result.size !== input.groups.length) fail('temporarily_unavailable');
  if (Buffer.byteLength(JSON.stringify([...result])) > input.limits.maxResponseBytes)
    fail('capacity_exceeded');
  return result;
}

export async function queryJoinedDocuments(
  tx: SqlExecutor,
  input: Input,
): Promise<ReadonlyMap<string, StoredJoinPage>> {
  validateInput(input);
  if (input.groups.every((group) => group.collections.length === 0)) {
    return new Map(
      input.groups.map((group) => [
        group.key,
        {
          rows: [],
          ...pageFor(input, group.key),
          hasNextPage: false,
          ...(input.count ? { total: 0 } : {}),
        },
      ]),
    );
  }
  const statement = unionStatement(input);
  const pages = await tx.query<RawPage>(statement.sql, statement.values);
  const copies = new Map(input.groups.map((group) => [group.key, group.copies ?? 1]));
  const cost = pages.rows.reduce(
    (total, page) =>
      total +
      Math.min(page.rows.length, pageFor(input, page.key).pageSize) * (copies.get(page.key) ?? 1),
    0,
  );
  if (input.maxRows !== undefined && cost > input.maxRows) fail('capacity_exceeded');
  const decoded = await decodedRows(tx, input, pages.rows);
  return buildPages(input, pages.rows, decoded);
}

function pageFor(input: Input, key: string) {
  const group = input.groups.find((entry) => entry.key === key);
  if (!group) fail('temporarily_unavailable');
  return { page: group.page ?? input.page, pageSize: group.pageSize ?? input.pageSize };
}
function validatePage(page: number, pageSize: number, limits: ContentLimits) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > limits.maxPageSize ||
    !Number.isSafeInteger(page * pageSize)
  )
    fail('invalid_input');
}
