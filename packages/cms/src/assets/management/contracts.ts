import { z } from 'zod';

export const cleanupEntrySchema = z.strictObject({
  id: z.uuid(),
  state: z.enum(['pending', 'ready', 'deleting', 'deleted']),
  blocked: z.boolean(),
  attempts: z.number().int().nonnegative(),
  failureCode: z.string().nullable(),
  retainUntil: z.iso.datetime(),
  writeDeadline: z.iso.datetime().nullable(),
  nextCleanupAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export const cleanupPageSchema = z.strictObject({
  rows: z.array(cleanupEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export const cleanupRetryReceiptSchema = z.strictObject({
  id: z.uuid(),
  accepted: z.literal(true),
  location: z.string(),
});
export type CleanupEntry = z.infer<typeof cleanupEntrySchema>;
export type CleanupPage = z.infer<typeof cleanupPageSchema>;
export type CleanupRetryReceipt = z.infer<typeof cleanupRetryReceiptSchema>;
