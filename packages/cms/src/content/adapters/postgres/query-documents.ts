import { projectionFields, projectReadData } from './read-projection.ts';
import type { RelationScope } from '../../model.ts';
import { historicalReadContext } from '../../fields/remap-locale.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits, Where } from '../../definition.ts';
import type { ContentMapping, QueryInput, RevisionRow, StoredPage } from '../../model.ts';
import type { QueryContext } from './query-context.ts';
import { parameter, trustedContext } from './query-context.ts';
import { compileOrder, compileSortValues, compileWhere } from './compile-query.ts';
import {
  documentProjection,
  documentRow,
  publicationLocale,
  publicationExpression,
} from './document-store.ts';
import type { RawDocumentRow } from './document-store.ts';
import { loadValueRows, revisionRow, migrateData, dataSchemaSql } from './revision-data.ts';
import { decodeFields } from './value-codec.ts';
import { assertWhereBudget } from '../../queries/parse-query.ts';
import { compileSearch } from './compile-search.ts';
import { groupMembership } from './group-values.ts';
import type { JsonValue } from '../../definition.ts';

export interface QueryOptions {
  valueReadableFields?: readonly string[];
  grouping?: { field: string; value: JsonValue };
  orderScope?: string;
  projection?: readonly string[];
  orderByPublished?: boolean;
  scan?: boolean;
  collection: string;
  query: QueryInput;
  where?: Where;
  queryableFields?: readonly string[];
  relationScopes?: readonly RelationScope[];
  limits: ContentLimits;
  mapping: ContentMapping;
}
export interface RawQueryRow extends RawDocumentRow {
  versionId: string;
  versionNumber: number;
  schemaVersion: number;
  dataSchemaVersion: number;
  kind: string;
  actorId: string;
  versionCreatedAt: Date;
  total: string;
}
export function contextFor(input: QueryOptions, budget = { nodes: 0 }): QueryContext {
  const collection = input.mapping.get(input.collection);
  return {
    mapping: input.mapping,
    collection,
    query: input.query,
    queryableFields: input.queryableFields ?? collection.flat.map((field) => field.path),
    relationScopes: input.relationScopes ?? [],
    limits: input.limits,
    values: [],
    aliases: { value: 0 },
    documentAlias: 'd',
    revisionAlias: 'r',
    joins: new Map(),
    indexAliases: new Map(),
    relationDepth: 0,
    budget,
    ...(input.orderScope === undefined ? {} : { orderScope: input.orderScope }),
    ...(input.grouping ? { grouping: input.grouping } : {}),
    ...(input.valueReadableFields ? { valueReadableFields: input.valueReadableFields } : {}),
  };
}
export function matchingSql(
  context: QueryContext,
  where?: Where,
  options: {
    orderByPublished?: boolean;
    sortProjection?: boolean;
    rowNumber?: boolean;
    sort?: false;
    selectProjection?: (context: QueryContext) => string;
  } = {},
): { sql: string; values: unknown[]; sort: readonly ('asc' | 'desc')[] } {
  const filters = matchingFilters(context, where);
  const sorts =
    options.sort === false || (options.orderByPublished && !options.sortProjection)
      ? []
      : compileSortValues(context);
  const order = options.orderByPublished
    ? 'r.created_at DESC,d.id ASC'
    : compileOrder(context, sorts);
  const extra = options.sortProjection
    ? sorts.map(({ expression }, index) => `,${expression} AS "sort_${index}"`).join('')
    : '';
  const ordinal =
    options.rowNumber === false ? '' : `,row_number() OVER(ORDER BY ${order}) AS ordinal`;
  const pointer = revisionPointer(context);
  const projection =
    options.selectProjection?.(context) ??
    `${documentProjection},r.id AS "versionId",r.revision AS "versionNumber",r.schema_version AS "schemaVersion",${dataSchemaSql('r', context.collection.definition.schemaVersion)} AS "dataSchemaVersion",r.kind,r.actor_id AS "actorId",r.created_at AS "versionCreatedAt"`;
  const from = `FROM content_documents d JOIN content_revisions r ON r.id=${pointer} ${[...context.joins.values()].join(' ')} WHERE ${filters.join(' AND ')}`;
  return {
    sql: `SELECT ${projection}${ordinal}${extra} ${from}`,
    values: context.values,
    sort: sorts.map((value) => value.order),
  };
}
function matchingFilters(context: QueryContext, where?: Where): string[] {
  const filters = [
    `d.collection_id=${parameter(context, context.collection.definition.id)}`,
    context.query.trashed ? 'd.trashed_at IS NOT NULL' : 'd.trashed_at IS NULL',
  ];
  if (context.query.folderId !== undefined)
    filters.push(
      context.query.folderId === null
        ? 'd.folder_id IS NULL'
        : `d.folder_id=${parameter(context, context.query.folderId)}::uuid`,
    );
  if (context.query.where) {
    assertWhereBudget(context.query.where, context.limits);
    filters.push(compileWhere(context.query.where, context));
  }
  if (context.query.policy) filters.push(trustedFilter(context, context.query.policy, false));
  if (where) filters.push(trustedFilter(context, where, true));
  if (context.grouping) filters.push(groupMembership(context, context.grouping));
  const search = compileSearch(context);
  if (search) filters.push(search);
  return filters;
}
function trustedFilter(context: QueryContext, where: Where, order: boolean): string {
  assertWhereBudget(where, context.limits);
  const trusted = trustedContext(context);
  const sql = compileWhere(where, trusted);
  if (order && trusted.nearOrder && queryableNear(context, where))
    context.nearOrder = trusted.nearOrder;
  return sql;
}

function queryableNear(context: QueryContext, where: Where): boolean {
  if ('and' in where) return where.and.every((child) => queryableNear(context, child));
  if ('or' in where) return where.or.every((child) => queryableNear(context, child));
  return where.operator !== 'near' || context.queryableFields.includes(where.field);
}
function revisionPointer(context: QueryContext): string {
  const pointer =
    context.query.mode === 'published'
      ? publicationExpression(
          'd',
          parameter(
            context,
            publicationLocale(context.collection.definition, context.query.locale),
          ),
        )
      : 'd.current_version_id';
  return pointer;
}
export function querySql(
  context: QueryContext,
  where: Where | undefined,
  options: { orderByPublished?: boolean; scan?: boolean } = {},
): { sql: string; values: unknown[] } {
  const matches = matchingSql(context, where, options);
  const limit = parameter(context, context.query.pageSize);
  if (options.scan)
    return { sql: `${matches.sql} ORDER BY d.id ASC LIMIT ${limit}`, values: context.values };
  const offset = parameter(context, (context.query.page - 1) * context.query.pageSize);
  return {
    sql: `WITH matches AS MATERIALIZED (${matches.sql}) SELECT *, (SELECT count(*) FROM matches) AS total FROM matches ORDER BY ordinal LIMIT ${limit} OFFSET ${offset}`,
    values: context.values,
  };
}
function validateQueryInput(input: QueryOptions): void {
  if (
    input.scan &&
    (input.query.page !== 1 ||
      input.query.sort?.length !== 1 ||
      input.query.sort[0]?.field !== 'id' ||
      input.query.sort[0]?.order !== 'asc')
  )
    fail('invalid_input');
  if (
    input.query.pageSize > input.limits.maxPageSize ||
    input.query.pageSize < 1 ||
    input.query.page < 1 ||
    !Number.isSafeInteger((input.query.page - 1) * input.query.pageSize)
  )
    fail('invalid_input');
}
export async function queryDocuments(tx: SqlExecutor, input: QueryOptions): Promise<StoredPage> {
  validateQueryInput(input);
  const context = contextFor(input);
  projectionFields(context.collection, input.projection);
  const statement = querySql(context, input.where, input);
  const result = await tx.query<RawQueryRow>(statement.sql, statement.values);
  let total = input.scan ? result.rows.length : Number(result.rows[0]?.total ?? 0);
  if (result.rows.length === 0 && input.query.page > 1) {
    const firstPage = statement.values.slice(0, -2);
    firstPage.push(1, 0);
    const count = await tx.query<RawQueryRow>(statement.sql, firstPage);
    total = Number(count.rows[0]?.total ?? 0);
  }
  const rows = await decodeRows(tx, input, result.rows);
  if (Buffer.byteLength(JSON.stringify(rows)) > input.limits.maxResponseBytes)
    fail('capacity_exceeded');
  return { rows, total, page: input.query.page, pageSize: input.query.pageSize };
}

export async function decodeRows(tx: SqlExecutor, input: QueryOptions, rawRows: RawQueryRow[]) {
  const current = input.mapping.get(input.collection);
  const locale = publicationLocale(current.definition, input.query.locale);
  if (input.projection === undefined && input.query.select?.length === 0)
    return rawRows.map((row) => storedRow(row, {}, locale));
  const grouped = new Map<number, RawQueryRow[]>();
  for (const row of rawRows) {
    const group = grouped.get(row.dataSchemaVersion) ?? [];
    group.push(row);
    grouped.set(row.dataSchemaVersion, group);
  }
  const decoded = new Map<string, ReturnType<typeof decodeFields>>();
  for (const [version, rows] of grouped) {
    const collection = input.mapping.get(input.collection, version);
    const origin = historicalReadContext({
      current: current.definition,
      schemaVersion: version,
      locale: input.query.locale,
      fallback: input.query.fallback,
    });
    const values = await loadValueRows(tx, {
      collection,
      versionIds: rows.map((row) => row.versionId),
      limits: input.limits,
      locales: [origin.locale, ...origin.fallback],
      ...(version === current.definition.schemaVersion && input.projection !== undefined
        ? { projection: input.projection }
        : {}),
    });
    for (const row of rows) {
      const data = migrateData({
        mapping: input.mapping,
        collection: input.collection,
        schemaVersion: version,
        data: decodeFields({
          fields: collection.fields,
          rows: values,
          mapping: input.mapping,
          versionId: row.versionId,
          parentPath: 'root',
          ...origin,
        }),
      });
      decoded.set(row.versionId, projectReadData(current, data, input.projection));
    }
  }
  return rawRows.map((row) => storedRow(row, decoded.get(row.versionId) ?? {}, locale));
}

function storedRow(row: RawQueryRow, data: ReturnType<typeof decodeFields>, locale: string) {
  const version: RevisionRow = revisionRow({
    id: row.versionId,
    documentId: row.id,
    collectionId: row.collectionId,
    revision: row.versionNumber,
    schemaVersion: row.schemaVersion,
    kind: row.kind,
    actorId: row.actorId,
    createdAt: row.versionCreatedAt,
  });
  return { document: documentRow(row, locale), version, data };
}
