import { z } from 'zod';
import { imageRecipeSchema } from '@new-cms/cms/assets';
import { fieldComponentsSchema } from '../collections/admin-components.ts';

export const editorIntentSchema = z.enum(['read', 'create', 'update', 'autosave', 'copy']);
export const editorAccessSchema = z.enum(['allowed', 'denied', 'conditional']);
export const editorActionSchema = z.strictObject({
  operationId: z.enum([
    'documents.create',
    'documents.update',
    'documents.autosave',
    'documents.copy',
    'documents.copyLocale',
    'documents.renameFile',
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

const choiceOptionsSchema = z.record(
  z.string(),
  z.array(
    z.union([
      z.string(),
      z.strictObject({
        value: z.string(),
        label: z.union([z.string(), z.record(z.string(), z.string())]),
      }),
    ]),
  ),
);

const constraintsSchema = z.strictObject({
  timezone: z.string().optional(),
  useAsSlug: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  precision: z.number().int().nonnegative().optional(),
  options: z
    .array(
      z.union([
        z.string(),
        z.object({
          value: z.string(),
          label: z.union([z.string(), z.record(z.string(), z.string())]),
        }),
      ]),
    )
    .optional(),
  minRows: z.number().int().nonnegative().optional(),
  maxRows: z.number().int().nonnegative().optional(),
  hasMany: z.boolean().optional(),
  maxDepth: z.number().int().nonnegative().optional(),
  filterOptions: z.boolean().optional(),
  relationTo: z.array(z.string()).optional(),
  join: z
    .strictObject({
      collections: z.array(z.string()),
      orderable: z.boolean(),
      defaultPageSize: z.number().int().positive(),
      maxPageSize: z.number().int().positive(),
    })
    .optional(),
  defaultValue: z.json().optional(),
});

export const editorNodeSchema = z.strictObject({
  id: z.string(),
  type: z.enum([
    'text',
    'slug',
    'textarea',
    'number',
    'boolean',
    'date',
    'email',
    'select',
    'radio',
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
    'ui',
  ]),
  name: z.string().optional(),
  label: z.string(),
  path: z.string().optional(),
  disableDuplicate: z.boolean().optional(),
  readOnly: z.boolean().optional(),
  hidden: z.boolean().optional(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  position: z.enum(['main', 'sidebar']).optional(),
  width: z.union([z.string(), z.number()]).optional(),
  required: z.boolean(),
  localized: z.boolean(),
  write: editorAccessSchema,
  queryable: z.boolean().optional(),
  condition: z.literal(true).optional(),
  components: fieldComponentsSchema.optional(),
  disabled: z
    .object({
      field: z.boolean(),
      column: z.boolean(),
      filter: z.boolean(),
      groupBy: z.boolean().optional(),
      bulkEdit: z.boolean(),
    })
    .optional(),
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
          components: fieldComponentsSchema.optional(),
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
          components: fieldComponentsSchema.optional(),
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
  initialData: z.record(z.string(), z.json()).nullable(),
  initialSnapshot: z.string().min(1).nullable(),
  visibility: z.record(z.string(), z.boolean()),
  choiceOptions: choiceOptionsSchema.optional(),
  componentVersions: z.record(z.string(), z.string()),
  componentProps: z.record(z.string(), z.record(z.string(), z.json())).optional(),
  dynamicComponentProps: z.boolean().optional(),
  schemas: z.strictObject({
    read: z.record(z.string(), z.unknown()),
    draft: z.record(z.string(), z.unknown()),
    commit: z.record(z.string(), z.unknown()),
  }),
  actions: z.array(editorActionSchema),
  collaboration: z
    .strictObject({
      durationMs: z.number().int().positive(),
      heartbeatMs: z.number().int().positive(),
    })
    .nullable()
    .optional(),
  preview: z.boolean().optional(),
  upload: z
    .strictObject({
      filesRequiredOnCreate: z.boolean(),
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
export const editorPreviewSchema = z.strictObject({
  behaviorHash: z.string(),
  visibility: z.record(z.string(), z.boolean()),
  componentProps: z.record(z.string(), z.record(z.string(), z.json())).optional(),
  choiceOptions: choiceOptionsSchema.optional(),
});
export type EditorPreview = z.infer<typeof editorPreviewSchema>;
