import { timezoneField } from './timezone-field.ts';
import type { CollectionDefinition, FieldDefinition } from '../definition.ts';

function nativeFields(fields: readonly FieldDefinition[]): FieldDefinition[] {
  return fields
    .filter((field) => !field.timezoneFor)
    .flatMap((field) => [
      {
        ...field,
        ...(field.type === 'slug'
          ? { required: field.required ?? true, unique: field.unique ?? true }
          : {}),
        ...(field.fields ? { fields: nativeFields(field.fields) } : {}),
        ...(field.blocks
          ? {
              blocks: field.blocks.map((block) => ({
                ...block,
                fields: nativeFields(block.fields),
              })),
            }
          : {}),
        ...(field.tabs
          ? { tabs: field.tabs.map((tab) => ({ ...tab, fields: nativeFields(tab.fields) })) }
          : {}),
      },
      ...(field.type === 'date' && field.timezone ? [timezoneField(field)] : []),
    ]);
}
export function normalizeNativeFields(collection: CollectionDefinition): CollectionDefinition {
  return {
    ...collection,
    fields: nativeFields(collection.fields),
    ...(collection.previousSchemas
      ? { previousSchemas: collection.previousSchemas.map(normalizeNativeFields) }
      : {}),
  };
}
