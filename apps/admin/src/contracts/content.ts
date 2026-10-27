import { z } from 'zod';
import {
  adminCollectionComponentsSchema,
  adminFieldComponentsSchema,
  adminViewSchema,
} from './admin-components.ts';
import { hierarchyMetadataSchema } from './hierarchy.ts';

export const collectionFieldSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.string(),
  label: z.string(),
  required: z.boolean(),
  localized: z.boolean(),
  queryable: z.boolean(),
  sortable: z.boolean(),
  groupable: z.boolean().optional(),
  components: adminFieldComponentsSchema.optional(),
  disabled: z
    .object({
      field: z.boolean(),
      column: z.boolean(),
      filter: z.boolean(),
      groupBy: z.boolean().optional(),
      bulkEdit: z.boolean(),
    })
    .optional(),
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
});

export const collectionSchema = z.object({
  enableQueryPresets: z.boolean().optional(),
  queryPresetConstraints: z
    .strictObject({
      read: z.array(z.strictObject({ value: z.string(), label: z.string(), dataSchema: z.json() })),
      update: z.array(
        z.strictObject({ value: z.string(), label: z.string(), dataSchema: z.json() }),
      ),
      delete: z.array(
        z.strictObject({ value: z.string(), label: z.string(), dataSchema: z.json() }),
      ),
    })
    .optional(),
  key: z.string(),
  label: z.string(),
  labels: z.object({ singular: z.string(), plural: z.string() }).optional(),
  schemaVersion: z.number().int().positive(),
  mode: z.enum(['direct', 'drafts']),
  drafts: z
    .object({
      validate: z.boolean(),
      autosave: z.union([z.literal(false), z.object({ intervalMs: z.number().int().positive() })]),
      schedule: z.boolean(),
    })
    .nullable(),
  history: z.boolean(),
  singleton: z.boolean(),
  disableBulkEdit: z.boolean().optional(),
  disableBulkDelete: z.boolean().optional(),
  disableDuplicate: z.boolean().optional(),
  hierarchy: hierarchyMetadataSchema.nullable().optional(),
  orderable: z.boolean(),
  authorship: z
    .object({ createdBy: z.boolean(), updatedBy: z.boolean(), queryable: z.boolean() })
    .optional(),
  admin: z
    .object({
      useAsTitle: z.string().optional(),
      useAsThumbnail: z.string().optional(),
      group: z.union([z.literal(false), z.string()]).optional(),
      hidden: z.boolean().optional(),
      pagination: z
        .object({
          defaultLimit: z.number().int().positive().optional(),
          limits: z.array(z.number().int().positive()).optional(),
        })
        .optional(),
      defaultColumns: z.array(z.string()).optional(),
      description: z.string().optional(),
      meta: z.record(z.string(), z.json()).optional(),
      disableCopyToLocale: z.boolean().optional(),
      enableRichTextLink: z.boolean().optional(),
      enableRichTextRelationship: z.boolean().optional(),
      components: adminCollectionComponentsSchema.optional(),
      views: z.array(adminViewSchema).optional(),
    })
    .optional(),
  defaultLocale: z.string(),
  locales: z.array(z.string()),
  defaultSort: z.array(z.object({ field: z.string(), order: z.enum(['asc', 'desc']) })),
  dataSchema: z.record(z.string(), z.unknown()),
  componentVersions: z.record(z.string(), z.string()).optional(),
  componentProps: z.record(z.string(), z.record(z.string(), z.json())).optional(),
  fields: z.array(collectionFieldSchema),
  behaviorHash: z.string(),
  mappingFingerprint: z.string(),
  upload: z.boolean(),
  capabilities: z.object({
    autosave: z.boolean(),
    publication: z.boolean(),
    localizedPublication: z.boolean().optional(),
    schedules: z.boolean(),
    history: z.boolean(),
    trash: z.literal(true),
    purge: z.literal(true),
  }),
});

export const collectionListSchema = z.object({ rows: z.array(collectionSchema) });
export type Collection = z.infer<typeof collectionSchema>;
export type CollectionField = z.infer<typeof collectionFieldSchema>;
