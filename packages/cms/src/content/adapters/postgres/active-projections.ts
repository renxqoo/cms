import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentLimits } from '../../definition.ts';
import type { ContentMapping } from '../../model.ts';
import { collectReferences } from '../../fields/collect-references.ts';
import { targetReadContext } from '../../queries/resolve-locale.ts';
import type { RevisionDataResult } from './read-data-batch.ts';
import { readRevisionDataBatch } from './read-data-batch.ts';
import { syncActiveUnique } from './unique-reservations.ts';
import { publicationLocales } from '../../documents/publication-locales.ts';

interface ProjectionInput {
  mapping: ContentMapping;
  limits: ContentLimits;
  collection: string;
  id: string;
  preserveLegacy?: boolean;
}

async function syncPublicationReferences(tx: SqlExecutor, input: ProjectionInput): Promise<void> {
  const { definition } = input.mapping.get(input.collection);
  const pending = await tx.query<{ locale: string; version_id: string }>(
    'SELECT locale,version_id FROM content_publications WHERE document_id=$1 AND NOT ($2=ANY(completed_schema_versions))',
    [input.id, definition.schemaVersion],
  );
  if (pending.rows.length === 0) return;
  const items = pending.rows.flatMap((row) =>
    (row.locale === '*' ? definition.locales.supported : [row.locale]).map((locale) => ({
      documentId: input.id,
      versionId: row.version_id,
      ...targetReadContext({ collection: definition, locale }),
    })),
  );
  const data = await readRevisionDataBatch(tx, { ...input, items });
  const references = publicationReferences(input, pending.rows, data);
  const serialized = JSON.stringify(references);
  if (Buffer.byteLength(serialized) > input.limits.maxStorageBytes) fail('capacity_exceeded');
  await tx.query(
    'DELETE FROM content_publication_references WHERE source_document_id=$1 AND projection_schema_version=$2 AND publication_locale=ANY($3::text[])',
    [input.id, definition.schemaVersion, pending.rows.map((row) => row.locale)],
  );
  if (references.length > 0)
    await tx.query(
      `INSERT INTO content_publication_references SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(source_document_id uuid,source_collection_id text,publication_locale text,source_revision_id uuid,projection_schema_version integer,field_id text,source_path text,target_document_id uuid,target_collection_id text,on_delete text,media boolean)`,
      [serialized],
    );
  await tx.query(
    'UPDATE content_publications SET completed_schema_versions=array_append(completed_schema_versions,$2) WHERE document_id=$1 AND locale=ANY($3::text[])',
    [input.id, definition.schemaVersion, pending.rows.map((row) => row.locale)],
  );
}

export async function syncActiveProjections(
  tx: SqlExecutor,
  input: ProjectionInput,
): Promise<void> {
  await syncActiveUnique(tx, input);
  await syncPublicationReferences(tx, input);
}

function publicationReferences(
  input: ProjectionInput,
  publications: readonly { locale: string; version_id: string }[],
  data: readonly RevisionDataResult[],
) {
  const { definition } = input.mapping.get(input.collection);
  return publications.flatMap((publication) =>
    data
      .filter(
        (item) =>
          item.versionId === publication.version_id &&
          (publication.locale === '*'
            ? publicationLocales(definition, item.data, item.locale).includes(item.locale)
            : publication.locale === item.locale),
      )
      .flatMap((item) =>
        collectReferences({
          collection: definition,
          data: item.data,
          locale: item.locale,
          limits: input.limits,
        }).map((reference) => ({
          source_document_id: input.id,
          source_collection_id: definition.id,
          publication_locale: publication.locale,
          source_revision_id: item.versionId,
          projection_schema_version: definition.schemaVersion,
          field_id: reference.fieldId,
          source_path: `${item.locale}:${reference.path}`,
          target_document_id: reference.id,
          target_collection_id: input.mapping.get(reference.collection).definition.id,
          on_delete: reference.onDelete,
          media: reference.media,
        })),
      ),
  );
}
