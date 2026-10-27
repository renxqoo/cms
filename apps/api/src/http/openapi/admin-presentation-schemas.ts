import { adminMetadataSchema } from '@new-cms/cms/content';
import { outputSchema } from './output-schema.ts';
import { array, object, reference, text } from './schema.ts';
import type { Schema } from './schema.ts';

export function adminPresentationSchemas(): Record<string, Schema> {
  return {
    AdminMetadata: outputSchema('AdminMetadata', adminMetadataSchema),
    ContentComponentProps: {
      type: 'object',
      additionalProperties: { type: 'object', additionalProperties: {} },
    },
    AdminAreas: object({
      field: { type: 'boolean' },
      column: { type: 'boolean' },
      filter: { type: 'boolean' },
      groupBy: { type: 'boolean' },
      bulkEdit: { type: 'boolean' },
    }),
    AdminView: object(
      {
        id: text,
        scope: { enum: ['collection', 'document'] },
        path: text,
        label: text,
        component: reference('AdminComponentReference'),
      },
      {
        actions: { oneOf: [{ const: false }, array(reference('AdminComponentReference'))] },
        tab: { type: 'boolean' },
        meta: reference('AdminMetadata'),
      },
    ),
  };
}
