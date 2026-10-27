import { adminComponentReferenceSchema } from './admin-components.ts';
import { z } from 'zod';
import { documentPageSchema, documentSchema } from './documents.ts';

export const hierarchyMetadataSchema = z.object({
  kind: z.enum(['hierarchy', 'tags']),
  components: z
    .object({
      Icon: adminComponentReferenceSchema.optional(),
      SmallIcon: adminComponentReferenceSchema.optional(),
    })
    .optional(),
  parentFieldName: z.string(),
  slugPathFieldName: z.string().optional(),
  titlePathFieldName: z.string().optional(),
  typeFieldName: z.string().optional(),
  allowHasMany: z.boolean(),
  treeLimit: z.number().int().positive(),
  useHeaderButton: z.boolean(),
  injectSidebarTab: z.boolean(),
  relatedCollections: z.array(
    z.object({ collection: z.string(), field: z.string(), hasMany: z.boolean() }),
  ),
});
export const hierarchyPageSchema = documentPageSchema.extend({ parentId: z.uuid().nullable() });
export const hierarchyMoveSchema = z.object({ rows: z.array(documentSchema) });
