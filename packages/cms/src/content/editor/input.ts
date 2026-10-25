import { z } from 'zod';

export function editorInputSchema(maxLocales: number) {
  const scope = {
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    locale: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/)
      .optional(),
  };
  const id = z.uuid().transform((value) => value.toLowerCase());
  return z.union([
    z.strictObject({
      ...scope,
      intent: z.literal('create'),
      mode: z.literal('editing').default('editing'),
    }),
    z.strictObject({
      ...scope,
      id,
      intent: z.enum(['update', 'autosave', 'copy']),
      mode: z.literal('editing').default('editing'),
    }),
    z.strictObject({
      ...scope,
      id,
      intent: z.literal('read').default('read'),
      mode: z.enum(['editing', 'published']).default('editing'),
      fallback: z.array(z.string()).max(maxLocales).optional(),
    }),
  ]);
}

export type EditorInput = z.infer<ReturnType<typeof editorInputSchema>>;
