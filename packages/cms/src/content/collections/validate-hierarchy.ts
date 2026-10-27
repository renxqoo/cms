import { fail } from '@new-cms/cms/platform/contracts';
import { fieldPaths } from '../fields/structure.ts';
import { hierarchySettings } from './hierarchy-config.ts';
import type { CollectionDefinition, ContentLimits } from '../definition.ts';

type Settings = NonNullable<ReturnType<typeof hierarchySettings>>;
function validateParent(collection: CollectionDefinition, options: Settings) {
  const parent = collection.fields.find((field) => field.name === options.parentFieldName);
  if (
    parent?.type !== 'relationship' ||
    parent.hasMany ||
    parent.localized ||
    parent.virtual ||
    parent.required ||
    JSON.stringify(parent.relationTo) !== JSON.stringify([collection.key])
  )
    fail('invalid_input');
}
function validatePaths(collection: CollectionDefinition, options: Settings) {
  for (const name of [options.slugPathFieldName, options.titlePathFieldName]) {
    const field = collection.fields.find((value) => value.name === name);
    if (field?.virtual !== true || field.type !== 'text' || field.required) fail('invalid_input');
  }
  const title = collection.admin?.useAsTitle;
  for (const name of [title, options.slugField].filter(
    (value): value is string => value !== undefined,
  ))
    if (
      !fieldPaths(collection.fields).some(
        ({ path, field, repeated }) =>
          path === name &&
          !repeated &&
          ['text', 'textarea', 'email'].includes(field.type) &&
          ![options.slugPathFieldName, options.titlePathFieldName].includes(name),
      )
    )
      fail('invalid_input');
}
function validateMany(
  collections: readonly CollectionDefinition[],
  input: { collection: CollectionDefinition; options: Settings },
) {
  if (input.options.allowHasMany) return;
  for (const source of collections)
    for (const { field } of fieldPaths(source.fields))
      if (
        source.key !== input.collection.key &&
        field.relationTo?.includes(input.collection.key) &&
        field.hasMany
      )
        fail('invalid_input');
}
export function validateHierarchy(
  collections: readonly CollectionDefinition[],
  limits: ContentLimits,
) {
  for (const collection of collections) {
    const options = hierarchySettings(collection);
    if (!options) continue;
    validateParent(collection, options);
    validatePaths(collection, options);
    validateMany(collections, { collection, options });
    const names = [options.parentFieldName, options.slugPathFieldName, options.titlePathFieldName];
    if (
      new Set(names).size !== names.length ||
      collection.singleton ||
      (options.admin.treeLimit !== undefined && options.admin.treeLimit > limits.maxPageSize)
    )
      fail('invalid_input');
  }
}
