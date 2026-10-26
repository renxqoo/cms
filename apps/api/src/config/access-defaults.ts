import type { InitialCollectionPermission } from '@new-cms/cms/access/composition';
import { contentOperations } from '@new-cms/cms/content';
import { assetsOperations } from '@new-cms/cms/assets';
import { collections } from './collections/index.ts';

export function initialCollectionPermissions(): InitialCollectionPermission[] {
  return collections.map((collection) => ({
    collectionKey: collection.key,
    code: `content:${collection.key}:manage`,
    name: `Manage ${collection.label}`,
    operationIds: [...contentOperations, ...(collection.upload ? assetsOperations : [])]
      .filter((operation) => operation.bindingConfigurable && operation.scopeKind === 'collection')
      .map((operation) => operation.id),
  }));
}
