import type { Endpoint } from '../../contracts/access';
import { parseRoleQuery } from '../roles/role-query';

export interface EndpointQuery {
  page: number;
  pageSize: number;
  module?: string | undefined;
  accessKind?: Endpoint['accessKind'] | undefined;
}

export function endpointKey(
  endpoint: Pick<Endpoint, 'operationId' | 'scopeKind' | 'collectionKey'>,
): string {
  return JSON.stringify([endpoint.operationId, endpoint.scopeKind, endpoint.collectionKey]);
}

export function sameEndpoint(first: Endpoint, second: Endpoint): boolean {
  return endpointKey(first) === endpointKey(second);
}

export function parseEndpointQuery(search: URLSearchParams): EndpointQuery {
  const { page, pageSize } = parseRoleQuery(search);
  const module = search.get('module');
  const accessKind = search.get('accessKind');
  return {
    page,
    pageSize,
    ...(module ? { module: module.slice(0, 32) } : {}),
    ...(accessKind === 'public' ||
    accessKind === 'authenticated' ||
    accessKind === 'security' ||
    accessKind === 'permission'
      ? { accessKind }
      : {}),
  };
}

export function endpointQueryHref(
  search: URLSearchParams,
  changes: Partial<EndpointQuery>,
): string {
  const next = { ...parseEndpointQuery(search), ...changes, page: changes.page ?? 1 };
  const query = new URLSearchParams({ page: String(next.page), pageSize: String(next.pageSize) });
  if (next.module) query.set('module', next.module);
  if (next.accessKind) query.set('accessKind', next.accessKind);
  return `/dashboard/endpoints?${query}`;
}
