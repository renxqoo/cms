import { fail } from '@new-cms/cms/platform/contracts';
import { hierarchySettings } from '../collections/hierarchy-config.ts';
import { dataFields } from '../fields/structure.ts';
import { optionValues } from '../fields/options.ts';
import type { CollectionDefinition, DocumentData, Where } from '../definition.ts';

export function allowedCollectionTypes(data: DocumentData, field: string): readonly string[] {
  const value = data[field];
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))
    fail('invalid_input');
  return value.filter((item): item is string => typeof item === 'string');
}

export function collectionTypeConstraint(
  collection: CollectionDefinition,
  source: string,
): Where | undefined {
  const settings = hierarchySettings(collection);
  if (!settings?.collectionSpecific || collection.key === source) return undefined;
  const field = settings.collectionSpecific.fieldName;
  const definition = dataFields(collection.fields).find((entry) => entry.name === field);
  if (!definition) fail('invalid_input');
  const types = optionValues(definition);
  if (types.length === 0) fail('invalid_input');
  return {
    or: [
      { field, operator: 'notIn', value: types },
      { field, operator: 'eq', value: source },
    ],
  };
}
