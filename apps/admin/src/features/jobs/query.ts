import { z } from 'zod';
import { cleanupStateSchema } from '../../contracts/cleanups';
import { jobActionSchema, jobStatusSchema } from '../../contracts/jobs';
import { uploadSessionSchema } from '../../contracts/assets';
import { discoveryPolicy } from './policy';

function positive(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 && number <= maximum ? number : fallback;
}

function option<T>(schema: z.ZodType<T>, value: string | null) {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function parseJobsQuery(search: URLSearchParams) {
  const documentId = option(z.uuid(), search.get('documentId'));
  return {
    collection: option(z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/), search.get('collection')) ?? '',
    tab: search.get('tab') === 'uploads' ? ('uploads' as const) : ('jobs' as const),
    page: positive(search.get('page'), 1),
    pageSize: positive(
      search.get('pageSize'),
      discoveryPolicy.defaultPageSize,
      discoveryPolicy.maximumPageSize,
    ),
    action: option(jobActionSchema, search.get('action')),
    jobStatus: option(jobStatusSchema, search.get('status')),
    uploadStatus: option(uploadSessionSchema.shape.status, search.get('status')),
    purpose: option(z.enum(['create', 'replace']), search.get('purpose')),
    documentId,
    jobId: option(z.uuid(), search.get('jobId')),
  };
}
export type JobsQuery = ReturnType<typeof parseJobsQuery>;

export function jobsApiQuery(query: JobsQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    ...(query.documentId ? { documentId: query.documentId } : {}),
    ...(query.tab === 'jobs'
      ? {
          ...(query.action ? { action: query.action } : {}),
          ...(query.jobStatus ? { status: query.jobStatus } : {}),
        }
      : {
          ...(query.purpose ? { purpose: query.purpose } : {}),
          ...(query.uploadStatus ? { status: query.uploadStatus } : {}),
        }),
  };
}

export function jobsQueryHref(
  search: URLSearchParams,
  changes: Readonly<Record<string, string | number | undefined>>,
) {
  const next = new URLSearchParams(search);
  if (!('page' in changes)) next.set('page', '1');
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  const parsed = parseJobsQuery(next);
  const query = new URLSearchParams({ collection: parsed.collection, tab: parsed.tab });
  if (parsed.jobId && parsed.tab === 'jobs') query.set('jobId', parsed.jobId);
  for (const [key, value] of Object.entries(jobsApiQuery(parsed))) query.set(key, String(value));
  return `/dashboard/jobs?${query}`;
}

export function parseCleanupQuery(search: URLSearchParams) {
  return {
    page: positive(search.get('page'), 1),
    pageSize: positive(
      search.get('pageSize'),
      discoveryPolicy.defaultPageSize,
      discoveryPolicy.maximumPageSize,
    ),
    blocked: search.get('blocked') !== 'false',
    state: option(cleanupStateSchema, search.get('state')),
  };
}
export type CleanupQuery = ReturnType<typeof parseCleanupQuery>;

export function cleanupQueryHref(search: URLSearchParams, changes: Partial<CleanupQuery>) {
  const query = { ...parseCleanupQuery(search), ...changes, page: changes.page ?? 1 };
  const params = new URLSearchParams({
    page: String(query.page),
    pageSize: String(query.pageSize),
    blocked: String(query.blocked),
  });
  if (query.state) params.set('state', query.state);
  return `/dashboard/asset-cleanups?${params}`;
}
