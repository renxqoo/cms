import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import { z } from 'zod';
import type { ContentLimits, DocumentData, ReferenceValue } from '../../definition.ts';
import type { ContentMapping, RevisionRow } from '../../model.ts';
import type { ContentStore } from './store-contract.ts';
import {
  currentCollections,
  lockPreparedSchema,
  verifySchemaState,
  lockPreparedSchemas,
} from './schema-state.ts';
import { readRevisionData, writeData, revisionProjection, revisionRow } from './revision-data.ts';
import { readDocument, lockDocuments, publicationLocale } from './document-store.ts';
import { writeIndexProjections } from './index-projections.ts';
import { syncActiveUnique } from './unique-reservations.ts';
import { writeReferences } from './history-store.ts';
import { validateData } from '../../fields/validate-data.ts';
import { normalizeLocaleData } from '../../fields/normalize-locale-data.ts';
import { historicalLocale } from '../../fields/remap-locale.ts';
import { remapReferencePath } from '../../fields/remap-reference-path.ts';
import { collectReferences } from '../../fields/collect-references.ts';
interface Options {
  mapping: ContentMapping;
  limits: ContentLimits;
}
interface BackfillInput extends Options {
  collection: string;
  from: number;
  to: number;
  pageSize: number;
  cursor?: string;
}
function assertInput(input: BackfillInput): void {
  if (
    !Number.isSafeInteger(input.pageSize) ||
    input.pageSize < 1 ||
    input.pageSize > input.limits.maxPageSize ||
    input.from >= input.to ||
    input.to !== input.mapping.get(input.collection).definition.schemaVersion ||
    (input.cursor !== undefined && !z.uuid().safeParse(input.cursor).success)
  )
    fail('invalid_input');
  input.mapping.get(input.collection, input.from);
}
async function pending(tx: SqlExecutor, input: BackfillInput): Promise<boolean> {
  const result = await tx.query(
    `SELECT 1 FROM content_revisions r JOIN content_documents d ON d.id=r.document_id WHERE r.collection_id=$1 AND r.schema_version=$2 AND (NOT EXISTS(SELECT 1 FROM content_schema_backfills b WHERE b.revision_id=r.id AND b.target_schema_version=$3) OR NOT EXISTS(SELECT 1 FROM content_schema_document_backfills b WHERE b.document_id=d.id AND b.target_schema_version=$3 AND b.revision=d.revision)) LIMIT 1`,
    [input.mapping.get(input.collection).definition.id, input.from, input.to],
  );
  return result.rowCount !== 0;
}
async function revisionData(
  tx: SqlExecutor,
  input: BackfillInput,
  row: RevisionRow,
): Promise<Record<string, DocumentData>> {
  const { definition } = input.mapping.get(input.collection);
  const data: Record<string, DocumentData> = {};
  for (const locale of definition.locales.supported) {
    data[locale] = await readRevisionData(tx, {
      ...input,
      documentId: row.documentId,
      versionId: row.id,
      locale,
      fallback: [],
    });
  }
  return normalizeLocaleData({
    collection: definition,
    patches: data,
    limits: input.limits,
    applyDefaults: true,
  }).dataByLocale;
}
async function backfillRevision(
  tx: SqlExecutor,
  input: BackfillInput,
  row: RevisionRow,
): Promise<void> {
  const existing = await tx.query(
    'SELECT 1 FROM content_schema_backfills WHERE revision_id=$1 AND target_schema_version=$2',
    [row.id, input.to],
  );
  if (existing.rowCount === 1) return;
  const { definition } = input.mapping.get(input.collection);
  const dataByLocale = await revisionData(tx, input, row);
  await writeData(tx, {
    ...input,
    id: row.id,
    documentId: row.documentId,
    revision: row.revision,
    actorId: row.actorId,
    schemaVersion: input.to,
    kind: row.kind,
    locale: definition.locales.default,
    data: dataByLocale[definition.locales.default] ?? {},
    dataByLocale,
  });
  await writeIndexProjections(tx, {
    ...input,
    documentId: row.documentId,
    versionId: row.id,
    schemaVersion: input.to,
    dataByLocale,
  });
  await backfillReferences(tx, input, { row, dataByLocale });
  await tx.query(
    'INSERT INTO content_schema_backfills(revision_id,document_id,collection_id,target_schema_version) VALUES($1,$2,$3,$4)',
    [row.id, row.documentId, definition.id, input.to],
  );
}
async function backfillDocument(tx: SqlExecutor, input: BackfillInput, id: string): Promise<void> {
  await validateActiveData(tx, input, id);
  await syncActiveUnique(tx, { ...input, id, preserveLegacy: true });
  await tx.query(
    `INSERT INTO content_schema_document_backfills(document_id,collection_id,target_schema_version,revision) SELECT id,collection_id,$2,revision FROM content_documents WHERE id=$1 ON CONFLICT(document_id,target_schema_version) DO UPDATE SET revision=excluded.revision,completed_at=now()`,
    [id, input.to],
  );
}
async function validateActiveData(
  tx: SqlExecutor,
  input: BackfillInput,
  id: string,
): Promise<void> {
  const { definition } = input.mapping.get(input.collection);
  const document = await readDocument(tx, { ...input, id });
  for (const locale of definition.locales.supported) {
    const versionId =
      definition.mode === 'direct'
        ? document.currentVersionId
        : document.publications?.[publicationLocale(definition, locale)];
    if (!versionId) continue;
    const fallback = Object.hasOwn(definition.locales.fallback, locale)
      ? (definition.locales.fallback[locale] ?? [])
      : [];
    const data = await readRevisionData(tx, {
      ...input,
      documentId: id,
      versionId,
      locale,
      fallback,
    });
    validateData({
      collection: definition,
      data,
      mode: 'publish',
      locale,
      limits: input.limits,
      applyDefaults: true,
    });
  }
}
export async function backfillSchema(
  tx: SqlExecutor,
  input: BackfillInput,
): ReturnType<ContentStore['backfillSchema']> {
  assertInput(input);
  await lockPreparedSchema(tx, { ...input, exclusive: false });
  const { definition } = input.mapping.get(input.collection);
  const budget = Math.max(
    1,
    Math.floor(
      (input.limits.maxSqlQueries - 12) /
        (24 +
          definition.locales.supported.length * 8 +
          input.mapping.get(input.collection).indexes.length * 2),
    ),
  );
  const result = await tx.query<Omit<RevisionRow, 'createdAt'> & { createdAt: Date }>(
    `SELECT ${revisionProjection} FROM content_revisions WHERE id IN(SELECT r.id FROM content_revisions r JOIN content_documents d ON d.id=r.document_id WHERE r.collection_id=$1 AND r.schema_version=$2 AND (NOT EXISTS(SELECT 1 FROM content_schema_backfills b WHERE b.revision_id=r.id AND b.target_schema_version=$3) OR NOT EXISTS(SELECT 1 FROM content_schema_document_backfills b WHERE b.document_id=d.id AND b.target_schema_version=$3 AND b.revision=d.revision)) ORDER BY d.id,(r.id>$4::uuid) DESC,r.id LIMIT $5 FOR UPDATE OF d SKIP LOCKED) ORDER BY id`,
    [
      definition.id,
      input.from,
      input.to,
      input.cursor ?? '00000000-0000-0000-0000-000000000000',
      Math.min(input.pageSize, budget),
    ],
  );
  const rows = result.rows.map(revisionRow);
  const ids = [...new Set(rows.map((row) => row.documentId))].toSorted();
  await lockDocuments(tx, { ids });
  for (const row of rows) await backfillRevision(tx, input, row);
  for (const id of ids) await backfillDocument(tx, input, id);
  const complete = !(await pending(tx, input));
  if (!complete && rows.length === 0) fail('temporarily_unavailable');
  return { processed: rows.length, cursor: rows.at(-1)?.id ?? null, complete };
}
async function assertCoverage(tx: SqlExecutor, input: Options): Promise<void> {
  const expected = currentCollections(input.mapping).map(({ definition }) => ({
    collection_id: definition.id,
    schema_version: definition.schemaVersion,
  }));
  const result = await tx.query(
    `SELECT 1 FROM jsonb_to_recordset($1::jsonb) c(collection_id text,schema_version integer) JOIN content_revisions r USING(collection_id) JOIN content_documents d ON d.id=r.document_id WHERE r.schema_version<>c.schema_version AND (NOT EXISTS(SELECT 1 FROM content_schema_backfills b WHERE b.revision_id=r.id AND b.target_schema_version=c.schema_version) OR NOT EXISTS(SELECT 1 FROM content_schema_document_backfills b WHERE b.document_id=d.id AND b.target_schema_version=c.schema_version AND b.revision=d.revision)) LIMIT 1`,
    [JSON.stringify(expected)],
  );
  if (result.rowCount !== 0) fail('temporarily_unavailable');
}
export async function activateSchema(
  tx: SqlExecutor,
  input: Options,
): ReturnType<ContentStore['activateSchema']> {
  const installed = await tx.query('SELECT 1 FROM content_schema_manifests WHERE fingerprint=$1', [
    input.mapping.fingerprint,
  ]);
  if (installed.rowCount !== 1) fail('temporarily_unavailable');
  const collections = currentCollections(input.mapping).toSorted((a, b) =>
    a.definition.id.localeCompare(b.definition.id),
  );
  await lockPreparedSchemas(tx, input.mapping);
  await assertCoverage(tx, input);
  await tx.query(
    `UPDATE content_schema_control c SET schema_version=x.schema_version,prepared_schema_version=NULL,prepared_fingerprint=NULL FROM jsonb_to_recordset($1::jsonb) x(collection_id text,schema_version integer) WHERE c.collection_id=x.collection_id`,
    [
      JSON.stringify(
        collections.map(({ definition }) => ({
          collection_id: definition.id,
          schema_version: definition.schemaVersion,
        })),
      ),
    ],
  );
  await verifySchemaState(tx, input.mapping);
  await tx.query("UPDATE content_schema_manifests SET status='ready' WHERE fingerprint=$1", [
    input.mapping.fingerprint,
  ]);
  return {
    fingerprint: input.mapping.fingerprint,
    collections: collections.map(({ definition }) => definition.key),
  };
}

async function backfillReferences(
  tx: SqlExecutor,
  input: BackfillInput,
  state: { row: RevisionRow; dataByLocale: Record<string, DocumentData> },
): Promise<void> {
  const { row, dataByLocale } = state;
  const { definition } = input.mapping.get(input.collection);
  const references = Object.entries(dataByLocale).flatMap(([locale, data]) =>
    collectReferences({ collection: definition, data, locale, limits: input.limits }).map(
      (ref) => ({ ...ref, path: `${locale}:${ref.path}` }),
    ),
  );
  await assertMediaOrigins(tx, input, { row, references });
  await writeReferences(
    tx,
    {
      collection: input.collection,
      documentId: row.documentId,
      versionId: row.id,
      schemaVersion: input.to,
      references,
    },
    input,
  );
}

interface MediaOrigin {
  path: string;
  fieldId: string;
  collectionId: string;
  documentId: string;
}
function originKey(origin: MediaOrigin): string {
  return JSON.stringify([origin.path, origin.fieldId, origin.collectionId, origin.documentId]);
}
async function assertMediaOrigins(
  tx: SqlExecutor,
  input: BackfillInput,
  state: { row: RevisionRow; references: readonly ReferenceValue[] },
): Promise<void> {
  const media = state.references.filter((reference) => reference.media);
  if (media.length === 0) return;
  const { definition: current } = input.mapping.get(input.collection);
  const { definition: original } = input.mapping.get(input.collection, state.row.schemaVersion);
  const expected = media.map((reference): MediaOrigin => {
    const separator = reference.path.indexOf(':');
    const locale = historicalLocale({
      current,
      schemaVersion: state.row.schemaVersion,
      locale: reference.path.slice(0, separator),
    });
    if (locale === null) fail('invalid_input');
    const path = remapReferencePath({
      from: current,
      to: original,
      path: reference.path.slice(separator + 1),
      fieldId: reference.fieldId,
    });
    return {
      path: `${locale}:${path}`,
      fieldId: reference.fieldId,
      collectionId: input.mapping.get(reference.collection).definition.id,
      documentId: reference.id,
    };
  });
  const existing = await tx.query<MediaOrigin>(
    'SELECT source_path AS path,field_id AS "fieldId",target_collection_id AS "collectionId",target_document_id AS "documentId" FROM content_references WHERE source_revision_id=$1 AND projection_schema_version=$2 AND media AND source_path=ANY($3::text[])',
    [state.row.id, state.row.schemaVersion, expected.map((origin) => origin.path)],
  );
  const known = new Set(existing.rows.map(originKey));
  if (expected.some((origin) => !known.has(originKey(origin)))) fail('invalid_input');
}
