import { z } from 'zod';
import type { ContentInputLimits } from '../input-schemas.ts';

export function hierarchyInputSchemas(limits: ContentInputLimits) {
  const id = z.uuid().transform((value) => value.toLowerCase());
  const collection = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);
  const locale = z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/)
    .optional();
  return {
    'hierarchy.tree': z.strictObject({
      collection,
      locale,
      mode: z.enum(['editing', 'published']).default('editing'),
      parentId: id.nullable().default(null),
      page: z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(limits.maxPageSize).optional(),
    }),
    'hierarchy.move': z
      .strictObject({
        collection,
        locale,
        parentId: id.nullable(),
        items: z
          .array(z.strictObject({ id, revision: z.number().int().positive().max(2_147_483_647) }))
          .min(1)
          .max(limits.maxBatchItems),
      })
      .refine((value) => new Set(value.items.map((item) => item.id)).size === value.items.length),
  };
}
