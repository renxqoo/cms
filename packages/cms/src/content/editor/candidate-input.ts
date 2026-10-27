import { z } from 'zod';
import { objectValue } from '../fields/json-value.ts';
import type { DocumentData } from '../definition.ts';

export const editorCandidateInputSchema = z.union([
  z.strictObject({
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    locale: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/)
      .optional(),
    mode: z.literal('editing').default('editing'),
    intent: z.literal('create'),
    initialSnapshot: z.string().min(1).optional(),
    data: z.custom<DocumentData>(objectValue).meta({ type: 'object', additionalProperties: {} }),
  }),
  z.strictObject({
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    locale: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9-]{0,31}$/)
      .optional(),
    mode: z.literal('editing').default('editing'),
    intent: z.enum(['update', 'autosave', 'copy']),
    id: z.uuid().transform((value) => value.toLowerCase()),
    revision: z
      .number()
      .int()
      .positive()
      .max(2 ** 31 - 1),
    data: z.custom<DocumentData>(objectValue).meta({ type: 'object', additionalProperties: {} }),
  }),
]);

export type EditorCandidateInput = z.infer<typeof editorCandidateInputSchema>;
