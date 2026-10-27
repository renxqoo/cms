import { z } from 'zod';
import { documentPageSchema } from './documents';

export const groupBySchema = z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) });
export const documentGroupsSchema = z.strictObject({
  rows: z.array(
    z.strictObject({
      key: z.uuid(),
      value: z.json(),
      label: z.string().optional(),
      documents: documentPageSchema,
    }),
  ),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type DocumentGroups = z.infer<typeof documentGroupsSchema>;
export type GroupBy = z.infer<typeof groupBySchema>;
