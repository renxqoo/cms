import { fail } from '@new-cms/cms/platform/contracts';
import type { FieldDefinition } from '../definition.ts';

export function validateUiField(field: FieldDefinition): void {
  const storage = [
    field.localized,
    field.required,
    field.unique,
    field.index,
    field.access,
    field.validate,
    field.virtual,
    field.hooks,
    field.fields,
    field.blocks,
    field.tabs,
    field.relationTo,
    field.hasMany,
    field.filterOptions,
    field.join,
  ];
  if (storage.some(Boolean) || field.defaultValue !== undefined) fail('invalid_input');
}
