import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import { publicLocaleSchema } from './query.ts';
export const issuePreviewInput = z
  .object({
    collection: z.literal('models'),
    id: z.uuid(),
    locale: publicLocaleSchema,
    expectedRevision: z.number().int().positive(),
  })
  .strict();
export const revokeTicketInput = z
  .object({ collection: z.literal('models'), id: z.uuid(), ticketId: z.uuid() })
  .strict();
export const revokeGrantInput = z.object({ grant: z.string() }).strict();
export const privatePreviewInput = z
  .object({
    slug: z.string().min(1).max(120),
    locale: z.string().min(1).max(80),
    grant: z.string(),
  })
  .strict();
export const privateIntegrationsInput = privatePreviewInput.extend({
  bindingKey: z.string().min(1).max(80).optional(),
  scenarioKey: z.string().min(1).max(80).optional(),
  recipeKey: z.string().min(1).max(80).optional(),
});
export function previewInput<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) fail('invalid_input');
  return result.data;
}
export type IssuePreviewInput = z.output<typeof issuePreviewInput>;
