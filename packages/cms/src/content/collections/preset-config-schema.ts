import { z } from 'zod';

export function presetConstraintsSchema(field: z.ZodType, policy: z.ZodType) {
  const constraint = z.strictObject({
    value: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
    label: z.string().min(1),
    fields: z.array(field).optional(),
    access: policy,
  });
  return z.strictObject({
    read: z.array(constraint).optional(),
    update: z.array(constraint).optional(),
    delete: z.array(constraint).optional(),
  });
}
