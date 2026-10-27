import { z } from 'zod';
import { editorCandidateInputSchema } from './candidate-input.ts';

export function editorPreviewInputSchema(maximum: number) {
  return z.union([
    editorCandidateInputSchema,
    z.strictObject({
      collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
      candidates: z.array(editorCandidateInputSchema).min(1).max(maximum),
    }),
  ]);
}
