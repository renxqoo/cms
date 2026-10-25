import { historicalReadContext } from '../../fields/remap-locale.ts';
import { ownValue } from '../../fields/json-value.ts';
const parameterLimit = 2 ** 16 - 1;
import { identifier } from '@new-cms/database/codegen';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits, DocumentData } from '../../definition.ts';
import type { CompiledCollection, ContentMapping, RevisionRow } from '../../model.ts';
import type { InsertRevisionInput, ReadRevisionInput } from './store-contract.ts';
import { decodeFields, encodeFields } from './value-codec.ts';
import type { EncodedRow, ValueRow } from './value-codec.ts';

export const revisionProjection =
  'id,document_id AS "documentId",collection_id AS "collectionId",revision,schema_version AS "schemaVersion",kind,actor_id AS "actorId",created_at AS "createdAt"';
export function revisionRow(
  row: Omit<RevisionRow, 'createdAt'> & { createdAt: Date | string },
): RevisionRow {
  return { ...row, createdAt: new Date(row.createdAt).toISOString() };
}
export async function readRevision(
  tx: SqlExecutor,
  input: { mapping: ContentMapping; collection: string; documentId: string; versionId: string },
): Promise<RevisionRow> {
  const result = await tx.query<Omit<RevisionRow, 'createdAt'> & { createdAt: Date }>(
    `SELECT ${revisionProjection} FROM content_revisions WHERE id=$1 AND document_id=$2 AND collection_id=$3`,
    [input.versionId, input.documentId, input.mapping.get(input.collection).definition.id],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  return revisionRow(row);
}
export async function loadValueRows(
  tx: SqlExecutor,
  input: {
    collection: CompiledCollection;
    versionIds: readonly string[];
    limits: ContentLimits;
    locales?: readonly string[];
  },
): Promise<Map<string, ValueRow[]>> {
  const result = new Map<string, ValueRow[]>();
  if (input.collection.flat.length === 0 || input.versionIds.length === 0) return result;
  const statements = input.collection.flat.map(
    (field) =>
      `SELECT '${field.table}'::text AS table_name,(to_jsonb(f)-'search_vector') AS data FROM ${identifier(field.table)} f WHERE revision_id=ANY($1::uuid[]) AND ($3::text[] IS NULL OR locale=ANY($3::text[]))`,
  );
  const rows = await tx.query<{ table_name: string; data: ValueRow | null; byte_count: string }>(
    `WITH content_values AS MATERIALIZED (${statements.join(' UNION ALL ')}), budget AS (SELECT COALESCE(sum(octet_length(data::text)),0) AS byte_count FROM content_values) SELECT table_name,data,budget.byte_count FROM content_values CROSS JOIN budget WHERE budget.byte_count<=$2 UNION ALL SELECT ''::text,NULL::jsonb,budget.byte_count FROM budget WHERE budget.byte_count>$2`,
    [
      [...input.versionIds],
      input.limits.maxStorageBytes,
      input.locales ? ['_', ...input.locales] : null,
    ],
  );
  for (const row of rows.rows) {
    if (!row.data) fail('capacity_exceeded');
    const items = result.get(row.table_name) ?? [];
    items.push(row.data);
    result.set(row.table_name, items);
  }
  return result;
}

export function migrateData(input: {
  mapping: ContentMapping;
  collection: string;
  schemaVersion: number;
  data: DocumentData;
}): DocumentData {
  const { definition } = input.mapping.get(input.collection);
  if (input.schemaVersion === definition.schemaVersion) return input.data;
  let { data } = input;
  let version = input.schemaVersion;
  while (version < definition.schemaVersion) {
    const migration = definition.migrations?.find((item) => item.from === version);
    if (!migration) {
      const oldFields = input.mapping.get(input.collection, version).flat;
      const currentFields = input.mapping.get(input.collection).flat;
      const same =
        oldFields.length === currentFields.length &&
        oldFields.every((field) =>
          currentFields.some(
            (current) =>
              current.identityPath === field.identityPath &&
              current.columnType === field.columnType &&
              current.field.type === field.field.type &&
              current.field.localized === field.field.localized,
          ),
        );
      if (!same) fail('invalid_input');
      const renamed = renameData(
        input.mapping.get(input.collection, version).fields,
        input.mapping.get(input.collection).fields,
        data,
      );
      return renamed;
    }
    data = migration.transform(structuredClone(data));
    version += 1;
  }
  return data;
}
function renameData(
  previous: CompiledCollection['fields'],
  next: CompiledCollection['fields'],
  data: DocumentData,
): DocumentData {
  const result: DocumentData = {};
  for (const field of previous) {
    const current = next.find((item) => item.field.id === field.field.id);
    const value = ownValue(data, String(field.field.name));
    if (!current || value === undefined) continue;
    if (
      field.field.type === 'group' &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    )
      result[String(current.field.name)] = renameData(field.children, current.children, value);
    else if (Array.isArray(value) && field.structural)
      result[String(current.field.name)] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? {
              ...('id' in item ? { id: item['id'] } : {}),
              ...('blockType' in item ? { blockType: item['blockType'] } : {}),
              ...renameData(field.children, current.children, item),
            }
          : item,
      );
    else result[String(current.field.name)] = value;
  }
  return result;
}
export interface DataRevision extends RevisionRow {
  dataSchemaVersion: number;
}
export function dataSchemaSql(alias: string, currentVersion: number): string {
  return `(CASE WHEN EXISTS(SELECT 1 FROM content_schema_backfills b WHERE b.revision_id=${alias}.id AND b.target_schema_version=${currentVersion}) THEN ${currentVersion} ELSE ${alias}.schema_version END)`;
}
async function readDataRevision(
  tx: SqlExecutor,
  input: ReadRevisionInput & { mapping: ContentMapping },
): Promise<DataRevision> {
  const current = input.mapping.get(input.collection).definition;
  const result = await tx.query<DataRevision>(
    `SELECT ${revisionProjection},${dataSchemaSql('content_revisions', current.schemaVersion)} AS "dataSchemaVersion" FROM content_revisions WHERE id=$1 AND document_id=$2 AND collection_id=$3`,
    [input.versionId, input.documentId, current.id],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  return row;
}
export async function readRevisionData(
  tx: SqlExecutor,
  input: ReadRevisionInput & { mapping: ContentMapping; limits: ContentLimits },
): Promise<DocumentData> {
  const revision = await readDataRevision(tx, input);
  const collection = input.mapping.get(input.collection, revision.dataSchemaVersion);
  const origin = historicalReadContext({
    current: input.mapping.get(input.collection).definition,
    schemaVersion: revision.dataSchemaVersion,
    locale: input.locale,
    fallback: input.fallback,
  });
  const rows = await loadValueRows(tx, {
    collection,
    versionIds: [input.versionId],
    limits: input.limits,
    locales: [origin.locale, ...origin.fallback],
  });
  const data = decodeFields({
    fields: collection.fields,
    rows,
    mapping: input.mapping,
    versionId: input.versionId,
    parentPath: 'root',
    ...origin,
  });
  return migrateData({ ...input, schemaVersion: revision.dataSchemaVersion, data });
}
function insertValues(input: {
  field: CompiledCollection['flat'][number];
  rows: readonly EncodedRow[];
  revision: InsertRevisionInput;
}): { sql: string; values: unknown[] } {
  const columns = [
    'revision_id',
    'document_id',
    'locale',
    'parent_path',
    'position',
    'state',
    'value',
  ];
  if (input.field.structural) columns.push('item_id', 'block_type');
  if (input.field.columnType === 'uuid') columns.push('target_collection_id');
  const values: unknown[] = [];
  const tuples = input.rows.map((row) => {
    let { value } = row;
    if (input.field.columnType === 'jsonb' && value !== null) value = JSON.stringify(value);
    const entry: unknown[] = [
      input.revision.id,
      input.revision.documentId,
      row.locale,
      row.parentPath,
      row.position,
      row.state,
      value,
    ];
    if (input.field.structural) entry.push(row.itemId, row.blockType);
    if (input.field.columnType === 'uuid') entry.push(row.targetCollectionId);
    return `(${entry
      .map((item) => {
        values.push(item);
        return `$${values.length}`;
      })
      .join(',')})`;
  });
  return {
    sql: `INSERT INTO ${identifier(input.field.table)} (${columns.map(identifier).join(',')}) VALUES ${tuples.join(',')}`,
    values,
  };
}
async function preserveLocales(
  tx: SqlExecutor,
  input: InsertRevisionInput & { mapping: ContentMapping; limits: ContentLimits },
  encoded: Map<string, EncodedRow[]>,
): Promise<void> {
  if (!input.previousVersionId) return;
  const revision = await readDataRevision(tx, { ...input, versionId: input.previousVersionId });
  const previous = input.mapping.get(input.collection, revision.dataSchemaVersion);
  const rows = await loadValueRows(tx, {
    collection: previous,
    versionIds: [input.previousVersionId],
    limits: input.limits,
  });
  const collection = input.mapping.get(input.collection, input.schemaVersion);
  for (const locale of collection.definition.locales.supported) {
    if (locale === input.locale) continue;
    const data = migrateData({
      ...input,
      schemaVersion: revision.dataSchemaVersion,
      data: decodeFields({
        fields: previous.fields,
        rows,
        mapping: input.mapping,
        versionId: input.previousVersionId,
        parentPath: 'root',
        ...historicalReadContext({
          current: collection.definition,
          schemaVersion: revision.dataSchemaVersion,
          locale,
          fallback: [],
        }),
      }),
    });
    const local = new Map<string, EncodedRow[]>();
    encodeFields(collection.fields, data, {
      mapping: input.mapping,
      locale,
      parentPath: 'root',
      output: local,
    });
    for (const [table, values] of local)
      encoded.set(table, [
        ...(encoded.get(table) ?? []),
        ...values.filter((value) => value.locale !== '_'),
      ]);
  }
}
export async function writeData(
  tx: SqlExecutor,
  input: InsertRevisionInput & { mapping: ContentMapping; limits: ContentLimits },
): Promise<void> {
  const collection = input.mapping.get(input.collection, input.schemaVersion);
  const encoded = new Map<string, EncodedRow[]>();
  if (input.dataByLocale) {
    for (const [locale, data] of Object.entries(input.dataByLocale)) {
      if (!collection.definition.locales.supported.includes(locale)) fail('invalid_input');
      const local = new Map<string, EncodedRow[]>();
      encodeFields(collection.fields, data, {
        mapping: input.mapping,
        locale,
        parentPath: 'root',
        output: local,
      });
      for (const [table, values] of local)
        encoded.set(table, [
          ...(encoded.get(table) ?? []),
          ...values.filter((value) => value.locale !== '_' || locale === input.locale),
        ]);
    }
  } else {
    await preserveLocales(tx, input, encoded);
    encodeFields(collection.fields, input.data, {
      mapping: input.mapping,
      locale: input.locale,
      parentPath: 'root',
      output: encoded,
    });
  }
  const statements: { sql: string; values: unknown[] }[] = [];
  for (const field of collection.flat) {
    const rows = encoded.get(field.table);
    if (!rows?.length) continue;
    const columnCount = 7 + (field.structural ? 2 : 0) + (field.columnType === 'uuid' ? 1 : 0);
    const rowLimit = Math.floor(parameterLimit / columnCount);
    for (let offset = 0; offset < rows.length; offset += rowLimit)
      statements.push(
        insertValues({ field, rows: rows.slice(offset, offset + rowLimit), revision: input }),
      );
  }
  await bulkStatements(tx, statements);
}
export async function bulkStatements(
  tx: SqlExecutor,
  statements: readonly { sql: string; values: unknown[] }[],
): Promise<void> {
  let values: unknown[] = [];
  let fragments: string[] = [];
  for (const statement of statements) {
    if (values.length + statement.values.length > parameterLimit && fragments.length > 0) {
      await tx.query(`WITH ${fragments.join(',')} SELECT 1`, values);
      values = [];
      fragments = [];
    }
    const offset = values.length;
    const sql = statement.sql.replaceAll(
      /\$(\d+)/g,
      (_match, index: string) => `$${Number(index) + offset}`,
    );
    fragments.push(`i${fragments.length} AS (${sql} RETURNING 1)`);
    values.push(...statement.values);
  }
  if (fragments.length > 0) await tx.query(`WITH ${fragments.join(',')} SELECT 1`, values);
}

export async function insertRevision(
  tx: SqlExecutor,
  input: InsertRevisionInput & { mapping: ContentMapping; limits: ContentLimits },
): Promise<RevisionRow> {
  const result = await tx.query<Omit<RevisionRow, 'createdAt'> & { createdAt: Date }>(
    `INSERT INTO content_revisions(id,document_id,collection_id,revision,schema_version,kind,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${revisionProjection}`,
    [
      input.id,
      input.documentId,
      input.mapping.get(input.collection).definition.id,
      input.revision,
      input.schemaVersion,
      input.kind,
      input.actorId,
    ],
  );
  await writeData(tx, input);
  const [row] = result.rows;
  if (!row) fail('temporarily_unavailable');
  return revisionRow(row);
}
