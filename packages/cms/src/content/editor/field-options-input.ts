import { z } from 'zod';
import { editorCandidateInputSchema } from './candidate-input.ts';

export function fieldOptionsInputSchema(limits: {
  maxPageSize: number;
  defaultPageSize: number;
  maxSyncBatchItems: number;
}) {
  return z.strictObject({
    collection: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    candidate: z.union([
      editorCandidateInputSchema,
      z.array(editorCandidateInputSchema).min(1).max(limits.maxSyncBatchItems),
    ]),
    path: z.string().min(1).max(512),
    relationTo: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
    q: z.string().max(256).optional(),
    id: z.uuid().optional(),
    page: z.number().int().positive().max(2_147_483_647).default(1),
    pageSize: z.number().int().positive().max(limits.maxPageSize).default(limits.defaultPageSize),
  });
}
