import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentMapping, DocumentRow } from '../../model.ts';
import type {
  InsertDocumentInput,
  ReadDocumentInput,
  UpdatePointersInput,
} from './store-contract.ts';

export const documentProjection =
  'd.id,d.collection_id AS "collectionId",d.revision,d.current_version_id AS "currentVersionId",d.published_version_id AS "publishedVersionId",d.trashed_at AS "trashedAt",d.folder_id AS "folderId",d.created_at AS "createdAt",d.updated_at AS "updatedAt"';
export interface RawDocumentRow extends Omit<DocumentRow, 'createdAt' | 'updatedAt' | 'trashedAt'> {
  createdAt: Date | string;
  updatedAt: Date | string;
  trashedAt: Date | string | null;
}
export function documentRow(row: RawDocumentRow): DocumentRow {
  return {
    id: row.id,
    collectionId: row.collectionId,
    revision: row.revision,
    currentVersionId: row.currentVersionId,
    publishedVersionId: row.publishedVersionId,
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
  return documentRow(row);
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
  const assignments = [
    'revision=$3',
    'current_version_id=$4',
    'published_version_id=$5',
    'updated_at=clock_timestamp()',
  ];
  const values: unknown[] = [
    input.id,
    input.mapping.get(input.collection).definition.id,
    input.revision,
    input.currentVersionId,
    input.publishedVersionId,
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
    `UPDATE content_documents d SET ${assignments.join(',')} WHERE d.id=$1 AND d.collection_id=$2 AND d.revision=$6 RETURNING ${documentProjection}`,
    values,
  );
  const [row] = result.rows;
  if (!row) fail('version_conflict');
  return documentRow(row);
}
