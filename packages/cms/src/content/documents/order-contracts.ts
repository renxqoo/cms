import { z } from 'zod';

export const documentOrderStateSchema = z.strictObject({ version: z.uuid() });

export function documentOrderInputSchemas(maximum: number) {
  const scope = {
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    locale: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/)
      .optional(),
  };
  return {
    'documents.order': z.strictObject(scope),
    'documents.reorder': z
      .strictObject({
        ...scope,
        version: z.uuid(),
        ids: z.array(z.uuid()).min(1).max(maximum),
        targetId: z.uuid(),
        position: z.enum(['before', 'after']),
      })
      .refine(
        (value) =>
          new Set(value.ids).size === value.ids.length && !value.ids.includes(value.targetId),
      ),
  };
}
