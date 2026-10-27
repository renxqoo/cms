import { z } from 'zod';
import { joinsInputSchema } from '../joins/input.ts';

export interface QueryInputLimits {
  defaultPageSize: number;
  maxPageSize: number;
  maxLocales: number;
  maxFields: number;
  maxQueryNodes: number;
}
export const contentLocaleSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/);

export function documentReadShape(limits: QueryInputLimits) {
  return {
    joins: joinsInputSchema(limits).optional(),
    locale: contentLocaleSchema.optional(),
    fallback: z.array(contentLocaleSchema).max(limits.maxLocales).optional(),
    mode: z.enum(['editing', 'published']).default('editing'),
    select: z.array(z.string().min(1).max(256)).max(limits.maxFields).optional(),
    depth: z.number().int().min(0).optional(),
  };
}

export function documentListShape(limits: QueryInputLimits) {
  return {
    context: z.literal('admin').optional(),
    page: z.number().int().min(1).max(2_147_483_647).default(1),
    pageSize: z.number().int().min(1).max(limits.maxPageSize).default(limits.defaultPageSize),
    q: z.string().max(256).optional(),
    where: z.unknown().optional(),
    sort: z
      .array(z.strictObject({ field: z.string().min(1).max(256), order: z.enum(['asc', 'desc']) }))
      .max(limits.maxQueryNodes)
      .optional(),
    trashed: z.boolean().default(false),
    folderId: z
      .uuid()
      .transform((value) => value.toLowerCase())
      .nullable()
      .optional(),
  };
}
