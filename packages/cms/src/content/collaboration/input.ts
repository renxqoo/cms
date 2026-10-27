import { z } from 'zod';

const uuid = z.uuid().transform((value) => value.toLowerCase());
const target = { collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), id: uuid };
const localized = {
  locale: z
    .string()
    .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/)
    .optional(),
};
const generation = z.number().int().positive().max(2_147_483_647);

export const collaborationInputSchemas = {
  'documents.getLock': z.strictObject({ ...target, ...localized, editorId: uuid.optional() }),
  'documents.acquireLock': z.strictObject({
    ...target,
    ...localized,
    editorId: uuid,
    generation: generation.optional(),
  }),
  'documents.releaseLock': z.strictObject({
    ...target,
    ...localized,
    editorId: uuid,
    generation,
  }),
  'documents.unlock': z.strictObject({ ...target, ...localized, editorId: uuid, generation }),
  'documents.preview': z.strictObject({
    ...target,
    locale: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/)
      .optional(),
  }),
};
