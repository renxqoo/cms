import type { Collection, CollectionField } from '../../contracts/content';

export function authorField(field: CollectionField): boolean {
  return field.id === field.path && ['createdBy', 'updatedBy'].includes(field.path);
}
export function filterFields(collection: Collection): CollectionField[] {
  const fields = [...collection.fields];
  if (!collection.authorship?.queryable) return fields;
  for (const path of ['createdBy', 'updatedBy'] as const) {
    if (!collection.authorship[path]) continue;
    fields.push({
      id: path,
      path,
      type: 'text',
      label: path,
      required: false,
      localized: false,
      queryable: true,
      sortable: false,
    });
  }
  return fields;
}
