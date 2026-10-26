import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentMapping, DocumentRow } from '../../model.ts';
import type { CollectionDefinition } from '../../definition.ts';
import type {
  InsertDocumentInput,
  ReadDocumentInput,
  UpdatePointersInput,
} from './store-contract.ts';

export const documentProjection = `d.id,d.collection_id AS "collectionId",d.revision,d.current_version_id AS "currentVersionId",(SELECT p.version_id FROM content_publications p WHERE p.document_id=d.id AND p.locale='*') AS "publishedVersionId",(SELECT COALESCE(jsonb_object_agg(p.locale,p.version_id),'{}'::jsonb) FROM content_publications p WHERE p.document_id=d.id) AS publications,d.trashed_at AS "trashedAt",d.folder_id AS "folderId",d.created_at AS "createdAt",d.updated_at AS "updatedAt"`;

export function publicationLocale(collection: CollectionDefinition, locale?: string): string {
  return collection.localizeStatus ? (locale ?? collection.locales.default) : '*';
}

export function publicationExpression(documentAlias: string, localeParameter: string): string {
  return `(SELECT p.version_id FROM content_publications p WHERE p.document_id=${documentAlias}.id AND p.locale=${localeParameter})`;
}
export interface RawDocumentRow extends Omit<DocumentRow, 'createdAt' | 'updatedAt' | 'trashedAt'> {
  createdAt: Date | string;
  updatedAt: Date | string;
  trashedAt: Date | string | null;
}
export function documentRow(row: RawDocumentRow, locale = '*'): DocumentRow {
  return {
    id: row.id,
    collectionId: row.collectionId,
    revision: row.revision,
    currentVersionId: row.currentVersionId,
    publishedVersionId: row.publications?.[locale] ?? null,
    publications: row.publications ?? {},
    trashedAt: row.trashedAt ? new Date(row.trashedAt).toISOString() : null,
    folderId: row.folderId,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}
export async function readDocument(
  tx: SqlExecutor,
  input: ReadDocumentInput & { mapping: ContentMapping },
): Promise<DocumentRow> {
  const result = await tx.query<RawDocumentRow>(
    `SELECT ${documentProjection} FROM content_documents d WHERE d.id=$1 AND d.collection_id=$2${input.lock ? ' FOR UPDATE' : ''}`,
    [input.id, input.mapping.get(input.collection).definition.id],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  return documentRow(
    row,
    publicationLocale(input.mapping.get(input.collection).definition, input.locale),
  );
}
export async function lockDocuments(
  tx: SqlExecutor,
  input: { ids: readonly string[] },
): Promise<void> {
  if (input.ids.length === 0) return;
  await tx.query(
    'SELECT id FROM content_documents WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [[...new Set(input.ids)].toSorted()],
  );
}
export async function insertDocument(
  tx: SqlExecutor,
  input: InsertDocumentInput & { mapping: ContentMapping },
): Promise<void> {
  const { definition } = input.mapping.get(input.collection);
  if (definition.singleton) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `content-singleton:${definition.id}`,
    ]);
    const current = await tx.query('SELECT id FROM content_documents WHERE collection_id=$1', [
      definition.id,
    ]);
    if (current.rowCount !== 0) fail('identifier_taken');
  }
  await tx.query('INSERT INTO content_documents(id,collection_id) VALUES($1,$2)', [
    input.id,
    definition.id,
  ]);
}
export async function updateDocumentPointers(
  tx: SqlExecutor,
  input: UpdatePointersInput & { mapping: ContentMapping },
): Promise<DocumentRow> {
  const assignments = ['revision=$3', 'current_version_id=$4', 'updated_at=clock_timestamp()'];
  const values: unknown[] = [
    input.id,
    input.mapping.get(input.collection).definition.id,
    input.revision,
    input.currentVersionId,
    input.expectedRevision,
  ];
  if (input.trashedAt !== undefined) {
    values.push(input.trashedAt);
    assignments.push(`trashed_at=$${values.length}`);
  }
  if (input.folderId !== undefined) {
    values.push(input.folderId);
    assignments.push(`folder_id=$${values.length}`);
  }
  const result = await tx.query<RawDocumentRow>(
    `UPDATE content_documents d SET ${assignments.join(',')} WHERE d.id=$1 AND d.collection_id=$2 AND d.revision=$5 RETURNING ${documentProjection}`,
    values,
  );
  const [row] = result.rows;
  if (!row) fail('version_conflict');
  const key = publicationLocale(input.mapping.get(input.collection).definition, input.locale);
  const publications = new Map(Object.entries(row.publications ?? {}));
  if (input.clearPublications) {
    await tx.query('DELETE FROM content_publications WHERE document_id=$1', [input.id]);
    publications.clear();
  } else if (input.publishedVersionId) {
    await tx.query(
      'INSERT INTO content_publications(document_id,collection_id,locale,version_id) VALUES($1,$2,$3,$4) ON CONFLICT(document_id,locale) DO UPDATE SET version_id=excluded.version_id',
      [input.id, row.collectionId, key, input.publishedVersionId],
    );
    publications.set(key, input.publishedVersionId);
  } else {
    await tx.query('DELETE FROM content_publications WHERE document_id=$1 AND locale=$2', [
      input.id,
      key,
    ]);
    publications.delete(key);
  }
  return documentRow({ ...row, publications: Object.fromEntries(publications) }, key);
}
