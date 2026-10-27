import type { Collection } from '../../contracts/content';

export const bulkOperations = {
  archive: 'documents.archive',
  copy: 'documents.copy',
  update: 'documents.update',
  restoreTrash: 'documents.restoreTrash',
} as const;
export type BulkAction = keyof typeof bulkOperations;

export function allowedBulkActions(collection: Collection, trashed: boolean): BulkAction[] {
  if (trashed) return collection.disableBulkEdit ? [] : ['restoreTrash'];
  return [
    ...(!collection.disableBulkDelete ? ['archive' as const] : []),
    ...(!collection.disableDuplicate ? ['copy' as const] : []),
    ...(!collection.disableBulkEdit ? ['update' as const] : []),
  ];
}

export function canBulkDocuments(
  collection: Collection,
  trashed: boolean,
  can: (operation: string, scope: { scopeKind: 'collection'; collectionKey: string }) => boolean,
): boolean {
  const scope = { scopeKind: 'collection', collectionKey: collection.key } as const;
  return (
    can('content.batch', scope) &&
    can('content.getJob', scope) &&
    allowedBulkActions(collection, trashed).some((action) => can(bulkOperations[action], scope))
  );
}
