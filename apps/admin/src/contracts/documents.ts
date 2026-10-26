import { z } from 'zod';
import { manifestSchema } from './assets';

export const fieldDataSchema = z.record(z.string(), z.json());
export const documentSchema = z.object({
  id: z.uuid(),
  collection: z.string(),
  revision: z.number().int().positive(),
  versionId: z.uuid(),
  publishedVersionId: z.uuid().nullable(),
  trashedAt: z.string().nullable(),
  folderId: z.uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  data: fieldDataSchema,
  file: manifestSchema.optional(),
  mediaBindings: z
    .array(
      z.object({
        bindingId: z.uuid(),
        sourcePath: z.string(),
        mediaDocumentId: z.uuid(),
        mediaCollectionKey: z.string(),
        manifest: manifestSchema,
      }),
    )
    .optional(),
});
export const documentPageSchema = z.object({
  rows: z.array(documentSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const versionSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
  schemaVersion: z.number().int().positive(),
  kind: z.string(),
  actorId: z.uuid(),
  createdAt: z.string(),
});
export const versionPageSchema = z.object({
  rows: z.array(versionSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const versionDetailSchema = documentSchema.extend({
  schemaVersion: z.number().int().positive(),
  kind: z.string(),
  actorId: z.uuid(),
});
export const versionDiffSchema = z.object({
  from: z.uuid(),
  to: z.uuid(),
  changes: z.array(z.object({ field: z.string(), before: z.unknown(), after: z.unknown() })),
});
export const purgeReceiptSchema = z.object({ id: z.uuid(), purged: z.literal(true) });
export type Document = z.infer<typeof documentSchema>;
export type DocumentPage = z.infer<typeof documentPageSchema>;
export type ContentVersion = z.infer<typeof versionSchema>;
