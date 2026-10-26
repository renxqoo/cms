import { z } from 'zod';
import { imageRecipeSchema } from '@new-cms/cms/assets';

export const editorIntentSchema = z.enum(['read', 'create', 'update', 'autosave', 'copy']);
export const editorAccessSchema = z.enum(['allowed', 'denied', 'conditional']);
export const editorActionSchema = z.strictObject({
  operationId: z.enum([
    'documents.create',
    'documents.update',
    'documents.autosave',
    'documents.copy',
    'documents.publish',
    'documents.unpublish',
    'documents.archive',
    'documents.restoreTrash',
    'documents.purge',
    'versions.restore',
    'content.schedulePublication',
    'content.cancelPublicationSchedule',
  ]),
  state: editorAccessSchema,
});

const constraintsSchema = z.strictObject({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  precision: z.number().int().nonnegative().optional(),
  options: z.array(z.string()).optional(),
  hasMany: z.boolean().optional(),
  relationTo: z.array(z.string()).optional(),
  defaultValue: z.json().optional(),
});

export const editorNodeSchema = z.strictObject({
  id: z.string(),
  type: z.enum([
    'text',
    'textarea',
    'number',
    'boolean',
    'date',
    'email',
    'select',
    'code',
    'json',
    'point',
    'group',
    'array',
    'blocks',
    'tabs',
    'row',
    'collapsible',
    'richText',
    'relationship',
    'upload',
    'join',
  ]),
  name: z.string().optional(),
  label: z.string(),
  path: z.string().optional(),
  required: z.boolean(),
  localized: z.boolean(),
  write: editorAccessSchema,
  queryable: z.boolean().optional(),
  constraints: constraintsSchema,
  get children() {
    return z.array(editorNodeSchema).optional();
  },
  get blocks() {
    return z
      .array(
        z.strictObject({
          id: z.string(),
          key: z.string(),
          label: z.string(),
          children: z.array(editorNodeSchema),
        }),
      )
      .optional();
  },
  get tabs() {
    return z
      .array(
        z.strictObject({
          id: z.string(),
          name: z.string().optional(),
          label: z.string(),
          children: z.array(editorNodeSchema),
        }),
      )
      .optional();
  },
});

export const collectionEditorSchema = z.strictObject({
  collection: z.string(),
  schemaVersion: z.number().int().positive(),
  behaviorHash: z.string(),
  mappingFingerprint: z.string(),
  publicationLocalesField: z.string().optional(),
  intent: editorIntentSchema,
  mode: z.enum(['editing', 'published']),
  locale: z.string(),
  fallback: z.array(z.string()),
  richTextNodes: z.array(z.strictObject({ type: z.string(), version: z.string() })),
  document: z
    .strictObject({
      id: z.uuid(),
      revision: z.number().int().positive(),
      versionId: z.uuid(),
      trashedAt: z.string().nullable(),
    })
    .nullable(),
  locales: z.strictObject({
    default: z.string(),
    supported: z.array(z.string()),
    enabled: z.array(z.string()).optional(),
    fallback: z.record(z.string(), z.array(z.string())),
  }),
  layout: z.array(editorNodeSchema),
  schemas: z.strictObject({
    read: z.record(z.string(), z.unknown()),
    draft: z.record(z.string(), z.unknown()),
    commit: z.record(z.string(), z.unknown()),
  }),
  actions: z.array(editorActionSchema),
  upload: z
    .strictObject({
      mimeTypes: z.array(z.string()),
      maxBytes: z.number().int().positive(),
      recipe: imageRecipeSchema,
      maxOutputBytes: z.number().int().positive(),
      maxPixels: z.number().int().positive(),
      maxFrames: z.number().int().positive(),
      maxWidth: z.number().int().positive(),
      maxHeight: z.number().int().positive(),
      maxVariants: z.number().int().positive(),
      directUpload: z.literal(false),
      multipart: z.literal(false),
    })
    .nullable(),
});

export type EditorIntent = z.infer<typeof editorIntentSchema>;
export type EditorAccess = z.infer<typeof editorAccessSchema>;
export type EditorAction = z.infer<typeof editorActionSchema>;
export type EditorNode = z.infer<typeof editorNodeSchema>;
export type CollectionEditor = z.infer<typeof collectionEditorSchema>;
