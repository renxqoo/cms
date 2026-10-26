import { assetUiPolicy } from './policy';

function positive(value: string | null, fallback: number, maximum: number) {
  const parsed = value !== null && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= maximum ? parsed : fallback;
}

export function resourceQuery(params: URLSearchParams) {
  return {
    page: positive(params.get('page'), 1, 2_147_483_647),
    pageSize: positive(params.get('pageSize'), assetUiPolicy.pageSize, 100),
    q: (params.get('q') ?? '').slice(0, 256),
    mode: params.get('mode') === 'published' ? ('published' as const) : ('editing' as const),
    trashed: params.get('trashed') === 'true',
    fallback: [],
    depth: 0,
  };
}

export function resourceHref(
  current: URLSearchParams,
  changes: Readonly<Record<string, string | number | boolean | undefined>>,
) {
  const next = new URLSearchParams(current);
  for (const key of Array.from(next.keys()))
    if (!['page', 'pageSize', 'q', 'mode', 'trashed', 'collection', 'uploadId'].includes(key))
      next.delete(key);
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined || value === '') next.delete(key);
    else next.set(key, String(value));
  }
  if (!Object.hasOwn(changes, 'page')) next.set('page', '1');
  return `/dashboard/resources?${next.toString()}`;
}
