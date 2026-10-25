import type { RelationScope } from '../../model.ts';
import { historicalReadContext } from '../../fields/remap-locale.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits, Where } from '../../definition.ts';
import type { ContentMapping, QueryInput, RevisionRow, StoredPage } from '../../model.ts';
import type { QueryContext } from './query-context.ts';
import { parameter, trustedContext } from './query-context.ts';
import { compileOrder, compileSearch, compileWhere } from './compile-query.ts';
import { documentProjection, documentRow } from './document-store.ts';
import type { RawDocumentRow } from './document-store.ts';
import { loadValueRows, revisionRow, migrateData, dataSchemaSql } from './revision-data.ts';
import { decodeFields } from './value-codec.ts';
import { assertWhereBudget } from '../../queries/parse-query.ts';

export interface QueryOptions {
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
  };
}
export function querySql(
  context: QueryContext,
  where: Where | undefined,
): { sql: string; values: unknown[] } {
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
  for (const policy of [context.query.policy, where])
    if (policy) {
      assertWhereBudget(policy, context.limits);
      filters.push(compileWhere(policy, trustedContext(context)));
    }
  const search = compileSearch(context);
  if (search) filters.push(search);
  const order = compileOrder(context);
  const pointer =
    context.query.mode === 'published' ? 'published_version_id' : 'current_version_id';
  const limit = parameter(context, context.query.pageSize);
  const offset = parameter(context, (context.query.page - 1) * context.query.pageSize);
  const from = `FROM content_documents d JOIN content_revisions r ON r.id=d.${pointer} ${[...context.joins.values()].join(' ')} WHERE ${filters.join(' AND ')}`;
  return {
    sql: `WITH matches AS MATERIALIZED (SELECT ${documentProjection},r.id AS "versionId",r.revision AS "versionNumber",r.schema_version AS "schemaVersion",${dataSchemaSql('r', context.collection.definition.schemaVersion)} AS "dataSchemaVersion",r.kind,r.actor_id AS "actorId",r.created_at AS "versionCreatedAt",row_number() OVER(ORDER BY ${order}) AS ordinal ${from}) SELECT *, (SELECT count(*) FROM matches) AS total FROM matches ORDER BY ordinal LIMIT ${limit} OFFSET ${offset}`,
    values: context.values,
  };
}
export async function queryDocuments(tx: SqlExecutor, input: QueryOptions): Promise<StoredPage> {
  if (
    input.query.pageSize > input.limits.maxPageSize ||
    input.query.pageSize < 1 ||
    input.query.page < 1 ||
    !Number.isSafeInteger((input.query.page - 1) * input.query.pageSize)
  )
    fail('invalid_input');
  const context = contextFor(input);
  const statement = querySql(context, input.where);
  const result = await tx.query<RawQueryRow>(statement.sql, statement.values);
  let total = Number(result.rows[0]?.total ?? 0);
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
  if (input.query.select?.length === 0) return rawRows.map((row) => storedRow(row, {}));
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
      current: input.mapping.get(input.collection).definition,
      schemaVersion: version,
      locale: input.query.locale,
      fallback: input.query.fallback,
    });
    const values = await loadValueRows(tx, {
      collection,
      versionIds: rows.map((row) => row.versionId),
      limits: input.limits,
      locales: [origin.locale, ...origin.fallback],
    });
    for (const row of rows)
      decoded.set(
        row.versionId,
        migrateData({
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
        }),
      );
  }
  const rows = rawRows.map((row) => storedRow(row, decoded.get(row.versionId) ?? {}));
  return rows;
}

function storedRow(row: RawQueryRow, data: ReturnType<typeof decodeFields>) {
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
  return { document: documentRow(row), version, data };
}
