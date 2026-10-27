import { z } from 'zod';

const locale = z.string().regex(/^(?!all$)[a-zA-Z][a-zA-Z0-9_-]{0,31}$/);
export const copyLocaleInputSchema = z
  .strictObject({
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    id: z.uuid().transform((value) => value.toLowerCase()),
    revision: z.number().int().min(1).max(2147483647),
    fromLocale: locale,
    toLocale: locale,
    overwrite: z.boolean().default(false),
  })
  .refine((value) => value.fromLocale !== value.toLocale);
