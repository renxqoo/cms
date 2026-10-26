import { verifySchemaState, requireWritableSchema } from './schema-state.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits } from '../../definition.ts';
import type { ContentMapping, RevisionRow } from '../../model.ts';
import type { ContentStore, StoreDocument } from './store-contract.ts';
import { readDocument } from './document-store.ts';
import { revisionProjection, revisionRow } from './revision-data.ts';

async function listVersions(
  tx: SqlExecutor,
  input: {
    mapping: ContentMapping;
    collection: string;
    id: string;
    page: number;
    pageSize: number;
    limits: ContentLimits;
  },
) {
  await readDocument(tx, input);
  if (
    input.page < 1 ||
    input.pageSize < 1 ||
    input.pageSize > input.limits.maxPageSize ||
    !Number.isSafeInteger((input.page - 1) * input.pageSize)
  )
    fail('invalid_input');
  const count = await tx.query<{ total: string }>(
    'SELECT count(*) AS total FROM content_revisions WHERE document_id=$1',
    [input.id],
  );
  const result = await tx.query<Omit<RevisionRow, 'createdAt'> & { createdAt: Date }>(
    `SELECT ${revisionProjection} FROM content_revisions WHERE document_id=$1 ORDER BY revision DESC LIMIT $2 OFFSET $3`,
    [input.id, input.pageSize, (input.page - 1) * input.pageSize],
  );
  return {
    rows: result.rows.map(revisionRow),
    total: Number(count.rows[0]?.total ?? 0),
    page: input.page,
    pageSize: input.pageSize,
  };
}
async function verifyPublications(tx: SqlExecutor, mapping: ContentMapping): Promise<void> {
  const publicationMigration = await tx.query(
    "SELECT 1 FROM cms_migrations WHERE name='0014_localized_publications.sql'",
  );
  if (publicationMigration.rowCount !== 1) fail('temporarily_unavailable');
  const publicationLocales = mapping.collections
    .filter(
      (collection) =>
        collection ===
        mapping.collections.findLast((item) => item.definition.id === collection.definition.id),
    )
    .map(({ definition }) => ({
      collection_id: definition.id,
      locales: definition.localizeStatus ? definition.locales.supported : ['*'],
    }));
  const validPublications = await tx.query(
    `SELECT 1 FROM content_publications p JOIN jsonb_to_recordset($1::jsonb) c(collection_id text,locales jsonb) USING(collection_id) WHERE NOT c.locales ? p.locale LIMIT 1`,
    [JSON.stringify(publicationLocales)],
  );
  if (validPublications.rowCount !== 0) fail('temporarily_unavailable');
}

async function verifyReady(tx: SqlExecutor, mapping: ContentMapping): Promise<void> {
  await verifyPublications(tx, mapping);
  const installed = await tx.query(
    "SELECT fingerprint FROM content_schema_manifests WHERE fingerprint=$1 AND status='ready'",
    [mapping.fingerprint],
  );
  if (installed.rowCount !== 1) fail('temporarily_unavailable');
  await verifySchemaState(tx, mapping);
  const columns = await tx.query<{ table_name: string; name: string; type: string }>(
    `SELECT t.relname AS table_name,a.attname AS name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=current_schema() AND t.relname=ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped`,
    [mapping.plan.tables.map((table) => table.name)],
  );
  const indexes = await tx.query<{ tablename: string; indexname: string }>(
    'SELECT tablename,indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename=ANY($1::text[])',
    [mapping.plan.tables.map((table) => table.name)],
  );
  for (const table of mapping.plan.tables) {
    if (
      table.columns.some(
        (column) =>
          !columns.rows.some(
            (actual) =>
              actual.table_name === table.name &&
              actual.name === column.name &&
              actual.type ===
                (column.type === 'timestamptz' ? 'timestamp with time zone' : column.type),
          ),
      )
    )
      fail('temporarily_unavailable');
    if (
      table.indexes.some(
        (index) =>
          !indexes.rows.some(
            (actual) => actual.tablename === table.name && actual.indexname === index.name,
          ),
      )
    )
      fail('temporarily_unavailable');
  }
}
export function createHistoryStore(options: {
  mapping: ContentMapping;
  limits: ContentLimits;
}): Pick<
  ContentStore,
  | 'listPrunableVersions'
  | 'listVersions'
  | 'inboundReferences'
  | 'writeReferences'
  | 'removeRevision'
  | 'purgeDocument'
  | 'verifyReady'
> {
  return {
    listPrunableVersions: (tx, input) => listPrunableVersions(tx, input, options),
    listVersions: (tx, input) => listVersions(tx, { ...options, ...input }),
    inboundReferences: (tx, input) => inboundReferences(tx, input, options),
    writeReferences: (tx, input) => writeReferences(tx, input, options),
    removeRevision: (tx, input) => removeRevision(tx, input, options),
    purgeDocument: (tx, input) => purgeDocument(tx, input, options),
    verifyReady: (tx) => verifyReady(tx, options.mapping),
  };
}
async function purge(
  tx: SqlExecutor,
  input: StoreDocument & { mapping: ContentMapping },
): Promise<void> {
  await readDocument(tx, { ...input, lock: true });
  const incoming = await tx.query(
    'SELECT 1 FROM content_references WHERE target_document_id=$1 AND source_document_id<>$1 LIMIT 1',
    [input.id],
  );
  if (incoming.rowCount !== 0) fail('resource_in_use');
  await tx.query('DELETE FROM content_publications WHERE document_id=$1', [input.id]);
  await tx.query('UPDATE content_documents SET current_version_id=NULL WHERE id=$1', [input.id]);
  await tx.query('DELETE FROM content_references WHERE source_document_id=$1', [input.id]);
  await tx.query('DELETE FROM content_revisions WHERE document_id=$1', [input.id]);
  await tx.query('DELETE FROM content_documents WHERE id=$1', [input.id]);
}

async function inboundReferences(
  tx: SqlExecutor,
  input: Parameters<ContentStore['inboundReferences']>[1],
  options: { mapping: ContentMapping; limits: ContentLimits },
) {
  await readDocument(tx, { ...options, ...input });
  const filters = [
    'x.target_document_id=$1',
    'x.projection_schema_version=(CASE WHEN EXISTS(SELECT 1 FROM content_schema_backfills b WHERE b.revision_id=x.source_revision_id AND b.target_schema_version=c.schema_version) THEN c.schema_version ELSE r.schema_version END)',
  ];
  const values: unknown[] = [input.id];
  if (input.active)
    filters.push(
      '(d.current_version_id=x.source_revision_id OR EXISTS(SELECT 1 FROM content_publications p WHERE p.document_id=d.id AND p.version_id=x.source_revision_id))',
    );
  if (input.excludeDocumentId) {
    values.push(input.excludeDocumentId);
    filters.push(`x.source_document_id<>$${values.length}::uuid`);
  }
  const limit = input.limit ?? options.limits.maxExpandNodes + 1;
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > Math.max(options.limits.maxArrayItems, options.limits.maxExpandNodes) + 1
  )
    fail('invalid_input');
  values.push(limit);
  const result = await tx.query<{
    sourceDocumentId: string;
    sourceRevisionId: string;
    sourceCollectionId: string;
    schemaVersion: number;
    path: string;
    fieldId: string;
    onDelete: 'restrict' | 'nullify' | 'cascade';
    active: boolean;
  }>(
    `SELECT x.source_document_id AS "sourceDocumentId",x.source_revision_id AS "sourceRevisionId",x.source_collection_id AS "sourceCollectionId",x.projection_schema_version AS "schemaVersion",x.source_path AS path,x.field_id AS "fieldId",x.on_delete AS "onDelete",(d.current_version_id=x.source_revision_id OR EXISTS(SELECT 1 FROM content_publications p WHERE p.document_id=d.id AND p.version_id=x.source_revision_id)) AS active FROM content_references x JOIN content_documents d ON d.id=x.source_document_id JOIN content_schema_control c ON c.collection_id=x.source_collection_id JOIN content_revisions r ON r.id=x.source_revision_id WHERE ${filters.join(' AND ')} ORDER BY x.source_document_id,x.source_revision_id,x.source_path LIMIT $${values.length}`,
    values,
  );
  return result.rows.map((row) => ({
    ...row,
    sourceCollection:
      options.mapping.collections.findLast(
        (collection) => collection.definition.id === row.sourceCollectionId,
      )?.definition.key ?? '',
  }));
}

export async function writeReferences(
  tx: SqlExecutor,
  input: Parameters<ContentStore['writeReferences']>[1],
  options: { mapping: ContentMapping; limits: ContentLimits },
): Promise<void> {
  const { definition } = options.mapping.get(input.collection);
  const schemaVersion = input.schemaVersion ?? definition.schemaVersion;
  await tx.query(
    'DELETE FROM content_references WHERE source_revision_id=$1 AND projection_schema_version=$2',
    [input.versionId, schemaVersion],
  );
  for (let offset = 0; offset < input.references.length; offset += 5000) {
    const values: unknown[] = [];
    const tuples = input.references.slice(offset, offset + 5000).map(
      (reference) =>
        `(${[
          input.versionId,
          input.documentId,
          definition.id,
          schemaVersion,
          reference.fieldId,
          reference.path,
          reference.id,
          options.mapping.get(reference.collection).definition.id,
          reference.onDelete,
          reference.media,
        ]
          .map((value) => {
            values.push(value);
            return `$${values.length}`;
          })
          .join(',')})`,
    );
    await tx.query(
      `INSERT INTO content_references(source_revision_id,source_document_id,source_collection_id,projection_schema_version,field_id,source_path,target_document_id,target_collection_id,on_delete,media) VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

async function removeRevision(
  tx: SqlExecutor,
  input: Parameters<ContentStore['removeRevision']>[1],
  options: { mapping: ContentMapping; limits: ContentLimits },
) {
  await requireWritableSchema(tx, { ...options, ...input });
  await readDocument(tx, { ...options, ...input, id: input.documentId });
  const result = await tx.query(
    'DELETE FROM content_revisions r WHERE r.id=$1 AND r.document_id=$2 AND r.collection_id=$3 AND NOT EXISTS(SELECT 1 FROM content_documents d WHERE d.current_version_id=r.id OR EXISTS(SELECT 1 FROM content_publications p WHERE p.document_id=d.id AND p.version_id=r.id))',
    [input.versionId, input.documentId, options.mapping.get(input.collection).definition.id],
  );
  if (result.rowCount !== 1) fail('resource_in_use');
}

async function purgeDocument(
  tx: SqlExecutor,
  input: Parameters<ContentStore['purgeDocument']>[1],
  options: { mapping: ContentMapping; limits: ContentLimits },
) {
  await requireWritableSchema(tx, { ...options, ...input });
  await purge(tx, { ...options, ...input });
}

async function listPrunableVersions(
  tx: SqlExecutor,
  input: Parameters<ContentStore['listPrunableVersions']>[1],
  options: { mapping: ContentMapping; limits: ContentLimits },
): Promise<RevisionRow[]> {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > options.limits.maxPageSize ||
    !Number.isSafeInteger(input.keepLatest) ||
    input.keepLatest < 0
  )
    fail('invalid_input');
  if (input.protectedIds.length > options.limits.maxArrayItems) fail('capacity_exceeded');
  const result = await tx.query<Omit<RevisionRow, 'createdAt'> & { createdAt: Date }>(
    `WITH ranked AS (SELECT *,row_number() OVER(ORDER BY revision DESC) AS position FROM content_revisions WHERE document_id=$1 AND collection_id=$2) SELECT ${revisionProjection} FROM ranked WHERE position>$3 AND ($4::timestamptz IS NULL OR created_at<$4::timestamptz) AND id<>ALL($5::uuid[]) ORDER BY revision DESC LIMIT $6`,
    [
      input.id,
      options.mapping.get(input.collection).definition.id,
      input.keepLatest,
      input.olderThan,
      [...input.protectedIds],
      input.limit,
    ],
  );
  return result.rows.map(revisionRow);
}
