import type { SqlExecutor } from '@new-cms/database/client';
import type { ContentMapping } from '../../model.ts';
import type { ContentStore } from './store-contract.ts';

export function presetReferenceStore(
  scoped: (tx: SqlExecutor) => Promise<{ mapping: ContentMapping }>,
): Pick<ContentStore, 'hasPresetReferences' | 'writePresetReferences'> {
  return {
    async hasPresetReferences(tx, id) {
      const result = await tx.query(
        'SELECT 1 FROM content_query_preset_references WHERE target_document_id=$1 LIMIT 1',
        [id],
      );
      return result.rowCount !== 0;
    },
    async writePresetReferences(tx, input) {
      const { mapping } = await scoped(tx);
      const values = [
        ...new Map(
          input.references.map((reference) => [`${reference.path}:${reference.id}`, reference]),
        ).values(),
      ].map((reference) => ({
        field_id: reference.fieldId,
        source_path: reference.path,
        target_document_id: reference.id,
        target_collection_id: mapping.get(reference.collection).definition.id,
      }));
      await tx.query('DELETE FROM content_query_preset_references WHERE preset_id=$1', [input.id]);
      if (values.length > 0)
        await tx.query(
          'INSERT INTO content_query_preset_references(preset_id,field_id,source_path,target_document_id,target_collection_id) SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) x(field_id text,source_path text,target_document_id uuid,target_collection_id text)',
          [input.id, JSON.stringify(values)],
        );
    },
  };
}
