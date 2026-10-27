import { z } from 'zod';
import { localizedTextSchema } from './labels.ts';
import { fieldComponentsSchema } from './admin-components.ts';

export function fieldAdminSchema<T extends z.ZodType>(condition: T) {
  return z.strictObject({
    readOnly: z.boolean().optional(),
    hidden: z.boolean().optional(),
    description: localizedTextSchema(2000).optional(),
    placeholder: localizedTextSchema(512).optional(),
    position: z.enum(['main', 'sidebar']).optional(),
    width: z.union([z.string().min(1).max(128), z.number().finite().nonnegative()]).optional(),
    condition: condition.optional(),
    disabled: z
      .union([
        z.boolean(),
        z.strictObject({
          field: z.boolean().optional(),
          column: z.boolean().optional(),
          filter: z.boolean().optional(),
          groupBy: z.boolean().optional(),
          bulkEdit: z.boolean().optional(),
        }),
      ])
      .optional(),
    components: fieldComponentsSchema.optional(),
  });
}
