import { z } from 'zod';

export function validationInputSchema(maxLocales: number) {
  const scope = {
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    mode: z.enum(['draft', 'publish']).default('publish'),
  };
  const target = {
    id: z.uuid().transform((value) => value.toLowerCase()),
    revision: z.number().int().min(1).max(2_147_483_647),
  };
  const locale = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/);
  const data = z.record(z.string(), z.unknown());
  const single = { locale: locale.optional(), data };
  const multiple = {
    dataByLocale: z
      .record(locale, data)
      .refine((value) => Object.keys(value).length > 0 && Object.keys(value).length <= maxLocales)
      .meta({ minProperties: 1, maxProperties: maxLocales }),
  };
  return z.union([
    z.strictObject({ ...scope, ...single }),
    z.strictObject({ ...scope, ...multiple }),
    z.strictObject({ ...scope, ...target, ...single }),
    z.strictObject({ ...scope, ...target, ...multiple }),
  ]);
}

export type ValidationInput = z.infer<ReturnType<typeof validationInputSchema>>;
