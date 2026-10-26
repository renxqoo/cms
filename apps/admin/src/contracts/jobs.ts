import { z } from 'zod';
import { assetJobSchema, uploadSessionSchema } from './assets';

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
export const contentJobSummarySchema = z.object({
  kind: z.literal('content'),
  id: z.uuid(),
  collection: z.string(),
  action: z.enum(['batch', 'publication', 'extension']),
  status: jobStatusSchema,
  executeAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
  documentId: z.uuid().nullable(),
  expectedRevision: z.number().int().positive().nullable(),
  requestedVersionId: z.uuid().nullable(),
  total: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
});
export const assetJobSummarySchema = z.object({
  kind: z.literal('asset'),
  id: z.uuid(),
  collection: z.string(),
  action: z.enum(['process', 'reprocess']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  attempts: z.number().int().nonnegative(),
  failureCode: z.string().nullable(),
  uploadId: z.uuid(),
  documentId: z.uuid().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export const jobSummarySchema = z.discriminatedUnion('kind', [
  contentJobSummarySchema,
  assetJobSummarySchema,
]);
export const jobPageSchema = z.object({
  rows: z.array(jobSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const contentJobSchema = contentJobSummarySchema.extend({
  items: z.array(
    z.object({
      position: z.number().int().nonnegative(),
      id: z.uuid(),
      status: z.enum(['queued', 'succeeded', 'failed']),
      resultId: z.uuid().optional(),
      versionId: z.uuid().optional(),
      error: z.object({ code: z.string() }).optional(),
    }),
  ),
});
export const jobDetailSchema = z.union([contentJobSchema, assetJobSchema]);
export const uploadSummarySchema = uploadSessionSchema.omit({ manifest: true });
export const uploadPageSchema = z.object({
  rows: z.array(uploadSummarySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type JobSummary = z.infer<typeof jobSummarySchema>;
export type JobDetail = z.infer<typeof jobDetailSchema>;
export type UploadSummary = z.infer<typeof uploadSummarySchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type JobAction = z.infer<typeof jobActionSchema>;

export const jobAcceptedSchema = z.object({
  jobId: z.uuid(),
  status: jobStatusSchema,
  location: z.string(),
});
export const batchResultSchema = z.union([contentJobSchema, jobAcceptedSchema]);
