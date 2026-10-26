import { z } from 'zod';

export const imageVariantSchema = z.strictObject({
  name: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fit: z.enum(['cover', 'contain', 'inside']),
  format: z.enum(['jpeg', 'png', 'webp']),
  quality: z.number().int().min(1).max(100),
});

export const imageRecipeSchema = z.strictObject({
  variants: z.array(imageVariantSchema),
  focalPoint: z
    .strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
    .optional(),
  crop: z
    .strictObject({
      left: z.number().int().nonnegative(),
      top: z.number().int().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .optional(),
});

export type ImageRecipe = z.infer<typeof imageRecipeSchema>;
export type ImageVariant = z.infer<typeof imageVariantSchema>;

export const manifestObjectSchema = z.strictObject({
  name: z.string(),
  bytes: z.number().int().nonnegative(),
  digest: z.string(),
  mimeType: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
});

export const manifestSchema = z.strictObject({
  id: z.uuid(),
  filename: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().positive(),
  digest: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  orientation: z.number().int().nullable(),
  processorVersion: z.string(),
  recipe: imageRecipeSchema,
  objects: z.array(manifestObjectSchema),
});

export const uploadSessionSchema = z.strictObject({
  id: z.uuid(),
  filename: z.string(),
  declaredMimeType: z.string(),
  declaredBytes: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  collection: z.string(),
  purpose: z.enum(['create', 'replace']),
  documentId: z.uuid().nullable(),
  revision: z.number().int().positive().nullable(),
  status: z.enum([
    'pending',
    'uploading',
    'processing',
    'ready',
    'consumed',
    'failed',
    'cancelled',
    'expired',
  ]),
  expiresAt: z.iso.datetime(),
  failureCode: z.string().nullable(),
  manifest: manifestSchema.nullable(),
  jobId: z.uuid().nullable(),
});

export const assetJobSchema = z.strictObject({
  id: z.uuid(),
  collection: z.string(),
  action: z.enum(['process', 'reprocess']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  attempts: z.number().int().nonnegative(),
  failureCode: z.string().nullable(),
  uploadId: z.uuid().nullable(),
  manifest: manifestSchema.nullable(),
});

export type Manifest = z.infer<typeof manifestSchema>;
export type UploadSession = z.infer<typeof uploadSessionSchema>;
export type AssetJob = z.infer<typeof assetJobSchema>;

export const referencePageSchema = z.object({
  rows: z.array(
    z.object({ collection: z.string(), id: z.uuid(), versionId: z.uuid(), sourcePath: z.string() }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
