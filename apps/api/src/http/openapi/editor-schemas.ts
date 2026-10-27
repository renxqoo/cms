import {
  collectionEditorSchema,
  editorNodeSchema,
  editorLeaseSchema,
  documentPreviewSchema,
  editorPreviewSchema,
  adminFieldComponentsSchema,
  adminComponentReferenceSchema,
  adminCollectionComponentsSchema,
} from '@new-cms/cms/content';
import { outputSchema } from './output-schema.ts';
import type { Schema } from './schema.ts';

export function editorResponseSchemas(): Record<string, Schema> {
  return {
    CollectionEditor: outputSchema('CollectionEditor', collectionEditorSchema),
    EditorPreview: outputSchema('EditorPreview', editorPreviewSchema),
    AdminComponentReference: outputSchema('AdminComponentReference', adminComponentReferenceSchema),
    AdminFieldComponents: outputSchema('AdminFieldComponents', adminFieldComponentsSchema),
    AdminCollectionComponents: outputSchema(
      'AdminCollectionComponents',
      adminCollectionComponentsSchema,
    ),
    EditorNode: outputSchema('EditorNode', editorNodeSchema),
    EditorLease: outputSchema('EditorLease', editorLeaseSchema),
    DocumentPreview: outputSchema('DocumentPreview', documentPreviewSchema),
  };
}
