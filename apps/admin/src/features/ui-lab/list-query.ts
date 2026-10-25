export interface ListQuery {
  q: string;
  status: 'all' | 'draft' | 'published';
  sort: { key: 'title' | 'updatedAt'; direction: 'asc' | 'desc' } | null;
  page: number;
  pageSize: number;
}

export function parseListQuery(params: URLSearchParams): ListQuery {
  const status = params.get('status');
  const sort = params.get('sort');
  const order = params.get('order');
  return {
    q: params.get('q') ?? '',
    status: status === 'draft' || status === 'published' ? status : 'all',
    sort:
      (sort === 'title' || sort === 'updatedAt') && (order === 'asc' || order === 'desc')
        ? { key: sort, direction: order }
        : null,
    page: positiveInteger(params.get('page'), 1),
    pageSize: [5, 10, 20].includes(Number(params.get('pageSize')))
      ? Number(params.get('pageSize'))
      : 5,
  };
}

function positiveInteger(value: string | null, fallback: number) {
  return value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : fallback;
}

export function updateListQuery(
  current: URLSearchParams,
  changes: Partial<Omit<ListQuery, 'sort'>> & { sort?: ListQuery['sort'] },
): string {
  const result = new URLSearchParams(current);
  for (const key of ['q', 'status', 'page', 'pageSize'] as const) {
    const value = changes[key];
    if (value === undefined) continue;
    if (value === '' || value === 'all') result.delete(key);
    else result.set(key, String(value));
  }
  if (changes.sort !== undefined) {
    if (changes.sort) {
      result.set('sort', changes.sort.key);
      result.set('order', changes.sort.direction);
    } else {
      result.delete('sort');
      result.delete('order');
    }
  }
  if (changes.q !== undefined || changes.status !== undefined || changes.sort !== undefined) {
    result.delete('page');
  }
  const query = result.toString();
  return query ? `/ui/lists?${query}` : '/ui/lists';
}
