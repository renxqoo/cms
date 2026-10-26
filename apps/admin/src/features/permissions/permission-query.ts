import { parseRoleQuery } from '../roles/role-query';
import type { RoleQuery } from '../roles/role-query';

export interface PermissionQuery extends RoleQuery {
  status?: 'active' | 'disabled' | undefined;
  scopeKind?: 'global' | 'collection' | undefined;
  collectionKey?: string | undefined;
}

export function parsePermissionQuery(search: URLSearchParams): PermissionQuery {
  const status = search.get('status');
  const scopeKind = search.get('scopeKind');
  const key = search.get('collectionKey');
  return {
    ...parseRoleQuery(search),
    ...(status === 'active' || status === 'disabled' ? { status } : {}),
    ...(scopeKind === 'global' || scopeKind === 'collection' ? { scopeKind } : {}),
    ...(scopeKind !== 'global' && key && /^[a-z][a-z0-9_-]{0,63}$/.test(key)
      ? { collectionKey: key }
      : {}),
  };
}

export function permissionQueryHref(
  search: URLSearchParams,
  changes: Partial<PermissionQuery>,
): string {
  const current = parsePermissionQuery(search);
  const next = { ...current, ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams({
    page: String(next.page),
    pageSize: String(next.pageSize),
    sortBy: next.sortBy,
    order: next.order,
  });
  if (next.q) query.set('q', next.q);
  if (next.status) query.set('status', next.status);
  if (next.scopeKind) query.set('scopeKind', next.scopeKind);
  if (next.collectionKey && next.scopeKind !== 'global')
    query.set('collectionKey', next.collectionKey);
  return `/dashboard/permissions?${query}`;
}
