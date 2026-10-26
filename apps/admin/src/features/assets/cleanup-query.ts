import type { AssetMessages } from './messages';
import { z } from 'zod';

const schema = z.object({
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce
    .number()
    .refine((value) => [10, 20, 50, 100].includes(value))
    .catch(20),
  blocked: z.enum(['true', 'false']).catch('true'),
  state: z.enum(['', 'pending', 'ready', 'deleting', 'deleted']).catch(''),
  selected: z.union([z.literal(''), z.uuid()]).catch(''),
});
export type CleanupQuery = z.infer<typeof schema>;
export function parseCleanupQuery(params: URLSearchParams) {
  return schema.parse(Object.fromEntries(params));
}
export function cleanupQueryHref(params: URLSearchParams, changes: Partial<CleanupQuery>) {
  const next = { ...parseCleanupQuery(params), ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value !== '') query.set(key, String(value));
  return `/dashboard/asset-cleanups?${query}`;
}
export function cleanupState(value: string) {
  return schema.shape.state.parse(value);
}

export function cleanupStatus(state: string, t: AssetMessages) {
  if (state === 'ready') return t.readyCleanup;
  if (state === 'pending') return t.pendingCleanup;
  return state === 'deleted' ? t.deleted : t.deleting;
}
