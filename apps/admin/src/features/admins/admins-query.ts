import { getAdminRoute } from '../../config/admin-routes';

export type AdminStatus = 'active' | 'disabled' | 'archived';
export type AdminSort = 'email' | 'displayName' | 'createdAt' | 'lastLoginAt';
export interface AdminListQuery {
  page: number;
  pageSize: number;
  q: string;
  status: 'all' | AdminStatus;
  activation: 'all' | 'pending' | 'activated';
  sortBy: AdminSort;
  order: 'asc' | 'desc';
}
export interface AdminQueryChanges extends Partial<Omit<AdminListQuery, 'sortBy' | 'order'>> {
  sort?: { key: AdminSort; direction: 'asc' | 'desc' } | null;
}

function positive(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function isAdminSort(value: string | null): value is AdminSort {
  return (
    value === 'email' || value === 'displayName' || value === 'createdAt' || value === 'lastLoginAt'
  );
}

export function parseAdminQuery(search: URLSearchParams): AdminListQuery {
  const status = search.get('status');
  const activation = search.get('activation');
  const sortBy = search.get('sortBy');
  return {
    page: positive(search.get('page'), 1),
    pageSize: positive(search.get('pageSize'), 20, 100),
    q: search.get('q') ?? '',
    status: status === 'active' || status === 'disabled' || status === 'archived' ? status : 'all',
    activation: activation === 'pending' || activation === 'activated' ? activation : 'all',
    sortBy: isAdminSort(sortBy) ? sortBy : 'createdAt',
    order: search.get('order') === 'asc' ? 'asc' : 'desc',
  };
}

export function adminApiQuery(query: AdminListQuery) {
  return {
    page: query.page,
    pageSize: query.pageSize,
    q: query.q,
    sortBy: query.sortBy,
    order: query.order,
    ...(query.status === 'all' ? {} : { status: query.status }),
    ...(query.activation === 'all' ? {} : { activation: query.activation }),
  };
}

export function updateAdminQuery(search: URLSearchParams, changes: AdminQueryChanges): string {
  const current = parseAdminQuery(search);
  const next = { ...current, ...changes };
  if (changes.sort !== undefined) {
    next.sortBy = changes.sort?.key ?? 'createdAt';
    next.order = changes.sort?.direction ?? 'desc';
  }
  if (changes.page === undefined) next.page = 1;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(adminApiQuery(next))) params.set(key, String(value));
  return `${getAdminRoute('admins').path}?${params}`;
}
