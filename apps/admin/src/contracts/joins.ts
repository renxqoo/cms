import { z } from 'zod';
import { documentSchema } from './documents';

export const joinPageSchema = z.strictObject({
  rows: z.array(
    z.union([documentSchema, z.strictObject({ collection: z.string(), id: z.uuid() })]),
  ),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  hasNextPage: z.boolean(),
  sort: z.array(z.strictObject({ field: z.string(), order: z.enum(['asc', 'desc']) })),
  total: z.number().int().nonnegative().optional(),
  orderVersion: z.uuid().optional(),
});
export type JoinPage = z.infer<typeof joinPageSchema>;
