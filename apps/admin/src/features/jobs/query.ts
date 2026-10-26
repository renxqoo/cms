import { z } from 'zod';
import { assetWorkPolicy } from './policy';

const querySchema = z.object({
  collection: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .catch(''),
  view: z.enum(['jobs', 'uploads']).catch('jobs'),
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce
    .number()
    .refine((value) => [10, 20, 50, 100].includes(value))
    .catch(assetWorkPolicy.pageSize),
  action: z.enum(['', 'batch', 'publication', 'extension', 'process', 'reprocess']).catch(''),
  status: z
    .enum([
      '',
      'queued',
      'running',
      'succeeded',
      'partial',
      'failed',
      'cancelled',
      'pending',
      'uploading',
      'processing',
      'ready',
      'consumed',
      'expired',
    ])
    .catch(''),
  purpose: z.enum(['', 'create', 'replace']).catch(''),
  documentId: z.union([z.literal(''), z.uuid()]).catch(''),
  selected: z.union([z.literal(''), z.uuid()]).catch(''),
});
export type WorkQuery = z.infer<typeof querySchema>;

export function parseWorkQuery(params: URLSearchParams): WorkQuery {
  const query = querySchema.parse(Object.fromEntries(params));
  const statuses =
    query.view === 'jobs'
      ? ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']
      : [
          'pending',
          'uploading',
          'processing',
          'ready',
          'consumed',
          'failed',
          'cancelled',
          'expired',
        ];
  return { ...query, status: statuses.includes(query.status) ? query.status : '' };
}

export function workQueryHref(params: URLSearchParams, changes: Partial<WorkQuery>) {
  const next = { ...parseWorkQuery(params), ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(next))
    if (value !== '') query.set(name, String(value));
  return `/dashboard/jobs?${query}`;
}

export function workFilters(query: WorkQuery) {
  const statuses =
    query.view === 'jobs'
      ? ['queued', 'running', 'succeeded', 'partial', 'failed', 'cancelled']
      : [
          'pending',
          'uploading',
          'processing',
          'ready',
          'consumed',
          'failed',
          'cancelled',
          'expired',
        ];
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(statuses.includes(query.status) ? { status: query.status } : {}),
    ...(query.documentId ? { documentId: query.documentId } : {}),
    ...(query.view === 'jobs' && query.action ? { action: query.action } : {}),
    ...(query.view === 'uploads' && query.purpose ? { purpose: query.purpose } : {}),
  };
}

export function workFilter<K extends 'status' | 'action'>(key: K, value: string): WorkQuery[K] {
  return querySchema.parse({ [key]: value })[key];
}
