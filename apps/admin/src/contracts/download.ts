import { z } from 'zod';

export const downloadResponseSchema = z.object({
  blob: z.instanceof(Blob),
  filename: z.string().nullable(),
  contentType: z.string(),
  etag: z.string().nullable(),
  bytes: z.number().int().nonnegative(),
});

export type DownloadResponse = z.infer<typeof downloadResponseSchema>;
