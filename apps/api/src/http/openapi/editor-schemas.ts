import { collectionEditorSchema, editorNodeSchema } from '@new-cms/cms/content';
import { outputSchema } from './output-schema.ts';
import type { Schema } from './schema.ts';

export function editorResponseSchemas(): Record<string, Schema> {
  return {
    CollectionEditor: outputSchema('CollectionEditor', collectionEditorSchema),
    EditorNode: outputSchema('EditorNode', editorNodeSchema),
  };
}
