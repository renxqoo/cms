import { z } from 'zod';
import { documentReadShape, documentListShape } from './input-shapes.ts';
import type { QueryInputLimits } from './input-shapes.ts';

export const groupBySchema = z.strictObject({
  field: z.string().min(1).max(256),
  order: z.enum(['asc', 'desc']),
});
const pageCoordinates = {
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
};
export const distinctPageSchema = z.strictObject({
  rows: z.array(z.json()),
  total: z.number().int().nonnegative(),
  ...pageCoordinates,
});
export const groupedDocumentPageSchema = z.strictObject({
  rows: z.array(
    z.strictObject({
      key: z.uuid(),
      value: z.json(),
      label: z.string().optional(),
      documents: z.strictObject({
        rows: z.array(z.json()),
        total: z.number().int().nonnegative(),
        ...pageCoordinates,
      }),
    }),
  ),
  total: z.number().int().nonnegative(),
  ...pageCoordinates,
});

export function groupingInputSchemas(limits: QueryInputLimits) {
  const scope = { collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/) };
  const read = documentReadShape(limits);
  const { sort: _sort, ...distinctList } = documentListShape(limits);
  const { select: _select, joins: _joins, depth: _depth, ...distinctRead } = read;
  const groupQuery = z.strictObject({
    page: z.number().int().min(1).max(2_147_483_647).optional(),
    pageSize: z.number().int().min(1).max(limits.maxPageSize).optional(),
  });
  return {
    'documents.distinct': z.strictObject({
      ...scope,
      ...distinctRead,
      ...distinctList,
      ...groupBySchema.shape,
    }),
    'documents.groups': z.strictObject({
      ...scope,
      ...read,
      ...documentListShape(limits),
      groupBy: groupBySchema,
      groupPageSize: z
        .number()
        .int()
        .min(1)
        .max(limits.maxPageSize)
        .default(limits.defaultPageSize),
      queryByGroup: z
        .record(z.uuid(), groupQuery)
        .refine((value) => Object.keys(value).length <= limits.maxQueryNodes)
        .optional(),
    }),
  };
}
