'use client';

import { collectionListSchema, documentListSchema } from '../../contracts/content';
import { useAccessControl } from '../access-control/provider';
import { useApiQuery } from '../management-shared/query';
import { resourceRequest } from './resource-query';
import type { ResourceQuery } from './resource-query';

export function useResourceData(query: ResourceQuery) {
  const access = useAccessControl();
  const catalog = useApiQuery({
    operation: 'collections.list',
    response: collectionListSchema,
    enabled: access.can('collections.list'),
  });
  const collections = (catalog.data?.rows ?? []).filter((collection) => collection.upload);
  const selected = collections.find((collection) => collection.key === query.collection);
  const validCollection = query.collection === '' || selected !== undefined;
  const allowed =
    validCollection &&
    (query.collection
      ? access.can('documents.list', { scopeKind: 'collection', collectionKey: query.collection })
      : access.can('resources.list'));
  const result = useApiQuery({
    operation: query.collection ? 'documents.list' : 'resources.list',
    ...(query.collection ? { params: { collection: query.collection } } : {}),
    query: resourceRequest({
      ...query,
      locale: selected?.locales.includes(query.locale) ? query.locale : '',
    }),
    response: documentListSchema,
    enabled: allowed,
  });
  const uploadCollections = collections.filter(
    (collection) =>
      access.can('documents.create', { scopeKind: 'collection', collectionKey: collection.key }) &&
      access.can('collections.editor', { scopeKind: 'collection', collectionKey: collection.key }),
  );
  return { access, catalog, collections, allowed, result, uploadCollections };
}
