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

const id = z.uuid();
const time = z.iso.datetime();
const count = z.number().int().nonnegative();

export const assetManifestSchema = z.object({
  id,
  filename: z.string(),
  mimeType: z.string(),
  bytes: count,
  digest: z.string(),
  width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(),
  orientation: z.number().int().nullable(),
  processorVersion: z.string(),
  recipe: imageRecipeSchema,
  objects: z.array(
    z.object({
      name: z.string(),
      bytes: count,
      digest: z.string(),
      mimeType: z.string(),
      width: z.number().int().positive().nullable(),
      height: z.number().int().positive().nullable(),
    }),
  ),
});

export const uploadStatusSchema = z.enum([
  'pending',
  'uploading',
  'processing',
  'ready',
  'consumed',
  'failed',
  'cancelled',
  'expired',
]);
export const uploadSummarySchema = z.object({
  id,
  filename: z.string(),
  declaredMimeType: z.string(),
  declaredBytes: count,
  createdAt: time,
  collection: z.string(),
  purpose: z.enum(['create', 'replace']),
  documentId: id.nullable(),
  revision: z.number().int().positive().nullable(),
  status: uploadStatusSchema,
  expiresAt: time,
  failureCode: z.string().nullable(),
  jobId: id.nullable(),
});
export const uploadSessionSchema = uploadSummarySchema.extend({
  manifest: assetManifestSchema.nullable(),
});
const page = {
  total: count,
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
};
export const uploadPageSchema = z.object({ rows: z.array(uploadSummarySchema), ...page });
export const uploadWrittenSchema = z.object({ uploadId: id, bytes: count, digest: z.string() });
export const processingAcceptedSchema = z.object({ jobId: id, uploadId: id });

export const jobStatusSchema = z.enum([
  'queued',
  'running',
  'succeeded',
  'partial',
  'failed',
  'cancelled',
]);
export const jobActionSchema = z.enum([
  'batch',
  'publication',
  'extension',
  'process',
  'reprocess',
]);
const contentJobSummarySchema = z.object({
  kind: z.literal('content'),
  id,
  collection: z.string(),
  action: z.enum(['batch', 'publication', 'extension']),
  status: jobStatusSchema,
  documentId: id.nullable(),
  expectedRevision: z.number().int().positive().nullable(),
  requestedVersionId: id.nullable(),
  executeAt: time,
  createdAt: time,
  finishedAt: time.nullable(),
  total: count,
  succeeded: count,
  failed: count,
});
const assetJobSummarySchema = z.object({
  kind: z.literal('asset'),
  id,
  collection: z.string(),
  action: z.enum(['process', 'reprocess']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  attempts: count,
  failureCode: z.string().nullable(),
  uploadId: id,
  documentId: id.nullable(),
  createdAt: time,
  finishedAt: time.nullable(),
});
export const jobSummarySchema = z.discriminatedUnion('kind', [
  contentJobSummarySchema,
  assetJobSummarySchema,
]);
export const jobSummaryPageSchema = z.object({ rows: z.array(jobSummarySchema), ...page });
export const assetJobSchema = z.object({
  id,
  collection: z.string(),
  action: z.enum(['process', 'reprocess']),
  status: assetJobSummarySchema.shape.status,
  attempts: count,
  failureCode: z.string().nullable(),
  uploadId: id.nullable(),
  manifest: assetManifestSchema.nullable(),
});
export const contentJobSchema = contentJobSummarySchema.extend({
  items: z.array(
    z.object({
      position: count,
      id,
      status: z.enum(['queued', 'succeeded', 'failed', 'cancelled']),
      resultId: id.optional(),
      versionId: id.optional(),
      error: z.object({ code: z.string() }).optional(),
    }),
  ),
});
export const jobResultSchema = z.union([contentJobSchema, assetJobSchema]);

export const cleanupEntrySchema = z.object({
  id,
  state: z.enum(['pending', 'ready', 'deleting', 'deleted']),
  blocked: z.boolean(),
  attempts: count,
  failureCode: z.string().nullable(),
  retainUntil: time,
  writeDeadline: time.nullable(),
  nextCleanupAt: time.nullable(),
  createdAt: time,
});
export const cleanupPageSchema = z.object({ rows: z.array(cleanupEntrySchema), ...page });
export const cleanupRetryReceiptSchema = z.object({
  id,
  accepted: z.literal(true),
  location: z.string(),
});

export type AssetManifest = z.infer<typeof assetManifestSchema>;
export type UploadSession = z.infer<typeof uploadSessionSchema>;
export type UploadSummary = z.infer<typeof uploadSummarySchema>;
export type UploadPage = z.infer<typeof uploadPageSchema>;
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobResult = z.infer<typeof jobResultSchema>;
export type JobSummaryPage = z.infer<typeof jobSummaryPageSchema>;
export type CleanupEntry = z.infer<typeof cleanupEntrySchema>;
export type CleanupPage = z.infer<typeof cleanupPageSchema>;
export type AssetJob = z.infer<typeof assetJobSchema>;
export type ProcessingAccepted = z.infer<typeof processingAcceptedSchema>;
export const resourceReferenceSchema = z.object({
  collection: z.string(),
  id,
  versionId: id,
  sourcePath: z.string(),
});
export const resourceReferencePageSchema = z.object({
  rows: z.array(resourceReferenceSchema),
  ...page,
});
export type ResourceReference = z.infer<typeof resourceReferenceSchema>;
