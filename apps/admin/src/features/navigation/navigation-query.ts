import { parseRoleQuery } from '../roles/role-query';

export function parseNavigationQuery(search: URLSearchParams) {
  const { page, pageSize, q } = parseRoleQuery(search);
  return { page, pageSize, q };
}

export function navigationQueryHref(
  search: URLSearchParams,
  changes: Partial<ReturnType<typeof parseNavigationQuery>>,
) {
  const next = { ...parseNavigationQuery(search), ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams({ page: String(next.page), pageSize: String(next.pageSize) });
  if (next.q) query.set('q', next.q);
  return `/dashboard/navigation?${query}`;
}
