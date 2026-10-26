import { expect, it } from 'vitest';
import { managementEndpoint } from '../../../../../../test/support/admin-management';
import {
  endpointKey,
  sameEndpoint,
  parseEndpointQuery,
  endpointQueryHref,
} from '../endpoint-model';

it('identifies exact operation and scope triples without conflating collections', () => {
  const global = managementEndpoint();
  const article = managementEndpoint({ scopeKind: 'collection', collectionKey: 'articles' });
  expect(sameEndpoint(global, article)).toBe(false);
  expect(sameEndpoint(article, { ...article, path: '/changed', binding: null })).toBe(true);
  expect(endpointKey(article)).not.toBe(endpointKey({ ...article, collectionKey: 'articles:fr' }));
});

it('accepts only the real endpoint catalog query contract and resets pagination after filters', () => {
  expect(
    parseEndpointQuery(
      new URLSearchParams(
        'page=-2&pageSize=1000&module=access&accessKind=security&q=secret&order=asc',
      ),
    ),
  ).toEqual({ page: 1, pageSize: 20, module: 'access', accessKind: 'security' });
  expect(parseEndpointQuery(new URLSearchParams('accessKind=bogus'))).not.toHaveProperty(
    'accessKind',
  );
  const href = endpointQueryHref(
    new URLSearchParams('page=9&pageSize=50&module=auth&accessKind=public&q=secret'),
    { module: undefined, accessKind: 'permission' },
  );
  expect(href).toBe('/dashboard/endpoints?page=1&pageSize=50&accessKind=permission');
  expect(endpointQueryHref(new URLSearchParams(), { page: 2 })).toContain('page=2');
  expect(parseEndpointQuery(new URLSearchParams({ module: 'x'.repeat(40) })).module).toHaveLength(
    32,
  );
});
