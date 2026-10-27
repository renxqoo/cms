import { z } from 'zod';
import type { Where, JsonValue } from '../definition.ts';

const jsonSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonSchema),
    z.record(z.string(), jsonSchema),
  ]),
);
export const whereSchema: z.ZodType<Where> = z.lazy(() =>
  z.union([
    z.strictObject({ and: z.array(whereSchema).min(1) }),
    z.strictObject({ or: z.array(whereSchema).min(1) }),
    z.strictObject({
      field: z.string().min(1).max(512),
      operator: z.enum([
        'eq',
        'ne',
        'in',
        'notIn',
        'exists',
        'gt',
        'gte',
        'lt',
        'lte',
        'contains',
        'all',
        'like',
        'notLike',
        'near',
        'within',
        'intersects',
      ]),
      value: jsonSchema,
    }),
  ]),
);
