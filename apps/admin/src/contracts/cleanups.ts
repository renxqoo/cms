import { z } from 'zod';

export const cleanupStateSchema = z.enum(['pending', 'ready', 'deleting', 'deleted']);
export const cleanupEntrySchema = z.object({
  id: z.uuid(),
  state: cleanupStateSchema,
  blocked: z.boolean(),
  attempts: z.number().int().nonnegative(),
  failureCode: z.string().nullable(),
  retainUntil: z.iso.datetime(),
  writeDeadline: z.iso.datetime().nullable(),
  nextCleanupAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const cleanupPageSchema = z.object({
  rows: z.array(cleanupEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const cleanupRetryReceiptSchema = z.object({
  id: z.uuid(),
  accepted: z.literal(true),
  location: z.string(),
});
export type CleanupEntry = z.infer<typeof cleanupEntrySchema>;
