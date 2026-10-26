import { z } from 'zod';

export const collectionFieldSchema = z.object({
  id: z.string(),
  path: z.string(),
  type: z.string(),
  label: z.string(),
  required: z.boolean(),
  localized: z.boolean(),
  queryable: z.boolean(),
  options: z.array(z.string()).optional(),
});

export const collectionSchema = z.object({
  key: z.string(),
  label: z.string(),
  schemaVersion: z.number().int().positive(),
  mode: z.enum(['direct', 'drafts']),
  history: z.boolean(),
  singleton: z.boolean(),
  locales: z.array(z.string()),
  dataSchema: z.record(z.string(), z.unknown()),
  fields: z.array(collectionFieldSchema),
  behaviorHash: z.string(),
  mappingFingerprint: z.string(),
  upload: z.boolean(),
  capabilities: z.object({
    autosave: z.boolean(),
    publication: z.boolean(),
    schedules: z.boolean(),
    history: z.boolean(),
    trash: z.literal(true),
    purge: z.literal(true),
  }),
});

export const collectionListSchema = z.object({ rows: z.array(collectionSchema) });
export type Collection = z.infer<typeof collectionSchema>;
export type CollectionField = z.infer<typeof collectionFieldSchema>;
