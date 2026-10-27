import { fieldPaths, structural } from '../fields/structure.ts';
import type { CollectionDefinition, SortField } from '../definition.ts';

export function safeDefaultSort(
  collection: CollectionDefinition,
  queryable: readonly string[],
): readonly SortField[] {
  const allowed = new Set(queryable);
  const sortable = new Set(['id', 'revision', 'createdAt', 'updatedAt', 'trashedAt', 'folderId']);
  for (const field of ['createdBy', 'updatedBy']) if (allowed.has(field)) sortable.add(field);
  for (const { path, field, repeated } of fieldPaths(collection.fields))
    if (
      allowed.has(path) &&
      !repeated &&
      !field.virtual &&
      !structural(field) &&
      field.type !== 'join'
    )
      sortable.add(path);
  if (collection.orderable) sortable.add('_order');
  const configured = collection.defaultSort?.filter((sort) => sortable.has(sort.field)) ?? [];
  if (configured.length > 0) return configured;
  return collection.orderable
    ? [{ field: '_order', order: 'asc' }]
    : [{ field: 'updatedAt', order: 'desc' }];
}
