export interface RoleQuery {
  page: number;
  pageSize: number;
  q: string;
  sortBy: 'createdAt' | 'code' | 'name';
  order: 'asc' | 'desc';
}

function positive(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function parseRoleQuery(search: URLSearchParams): RoleQuery {
  const sortBy = search.get('sortBy');
  return {
    page: positive(search.get('page'), 1),
    pageSize: positive(search.get('pageSize'), 20, 100),
    q: (search.get('q') ?? '').slice(0, 128),
    sortBy: sortBy === 'name' || sortBy === 'code' ? sortBy : 'createdAt',
    order: search.get('order') === 'asc' ? 'asc' : 'desc',
  };
}

export function roleQueryHref(search: URLSearchParams, changes: Partial<RoleQuery>): string {
  const current = parseRoleQuery(search);
  const next = {
    ...current,
    ...changes,
    page:
      changes.page ??
      (changes.pageSize !== undefined ||
      changes.q !== undefined ||
      changes.sortBy !== undefined ||
      changes.order !== undefined
        ? 1
        : current.page),
  };
  const query = new URLSearchParams({
    page: String(next.page),
    pageSize: String(next.pageSize),
    sortBy: next.sortBy,
    order: next.order,
  });
  if (next.q) query.set('q', next.q);
  return `/dashboard/roles?${query}`;
}
