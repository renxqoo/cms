import { z } from 'zod';
import { publicLocaleSchema } from './query.ts';
export const exportInput = z
  .object({
    kind: z.enum(['documents', 'model-guides', 'sitemap']),
    locale: publicLocaleSchema,
    bucket: z
      .string()
      .regex(/^(?:[0-9]|1[0-5])$/u)
      .transform(Number)
      .optional(),
  })
  .strict();
export type ExportInput = z.output<typeof exportInput>;
