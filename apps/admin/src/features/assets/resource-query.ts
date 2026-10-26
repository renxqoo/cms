import { z } from 'zod';

const schema = z.object({
  collection: z.union([z.literal(''), z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/)]).catch(''),
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce
    .number()
    .refine((value) => [10, 20, 50, 100].includes(value))
    .catch(20),
  q: z.string().max(256).catch(''),
  trashed: z.enum(['true', 'false']).catch('false'),
  locale: z.union([z.literal(''), z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/)]).catch(''),
});
export type ResourceQuery = z.infer<typeof schema>;
export function parseResourceQuery(params: URLSearchParams) {
  return schema.parse(Object.fromEntries(params));
}
export function resourceQueryHref(params: URLSearchParams, changes: Partial<ResourceQuery>) {
  const next = { ...parseResourceQuery(params), ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(next)) if (value !== '') query.set(key, String(value));
  return `/dashboard/resources?${query}`;
}
export function resourceRequest(query: ResourceQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    q: query.q,
    trashed: query.trashed === 'true',
    mode: 'editing',
    depth: 0,
    fallback: [],
    ...(query.collection && query.locale ? { locale: query.locale } : {}),
  };
}
