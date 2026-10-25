import { ownValue } from './json-value.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { documentMetadataFields } from '../model.ts';
import type { CollectionDefinition } from '../definition.ts';
import { objectValue } from './json-value.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';

export function dataFields(fields: readonly FieldDefinition[]): FieldDefinition[] {
  return fields.flatMap((field) => {
    if (field.type === 'row' || field.type === 'collapsible') return dataFields(field.fields ?? []);
    if (field.type !== 'tabs') return [field];
    return (field.tabs ?? []).flatMap((tab) =>
      tab.name
        ? [
            {
              id: tab.id,
              name: tab.name,
              label: tab.label,
              type: 'group' as const,
              fields: dataFields(tab.fields),
            },
          ]
        : dataFields(tab.fields),
    );
  });
}
export function structural(field: FieldDefinition): boolean {
  return ['group', 'array', 'blocks'].includes(field.type);
}
export function children(field: FieldDefinition): FieldDefinition[] {
  if (field.type === 'blocks')
    return (field.blocks ?? []).flatMap((block) => dataFields(block.fields));
  return dataFields(field.fields ?? []);
}
export function fieldPaths(
  fields: readonly FieldDefinition[],
  prefix = '',
): { path: string; field: FieldDefinition; repeated: boolean }[] {
  return dataFields(fields).flatMap((field) => {
    const path = prefix ? `${prefix}.${field.name}` : String(field.name);
    const own = {
      path,
      field,
      repeated: field.type === 'array' || field.type === 'blocks' || field.hasMany === true,
    };
    return [
      own,
      ...fieldPaths(children(field), path).map((child) => ({
        ...child,
        repeated: own.repeated || child.repeated,
      })),
    ];
  });
}

export function dataFieldInstances(input: {
  fields: readonly FieldDefinition[];
  data: DocumentData;
}): { field: FieldDefinition; path: string }[] {
  return instances(input.fields, input.data, '');
}
function instances(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  prefix: string,
): { field: FieldDefinition; path: string }[] {
  return dataFields(fields).flatMap((field) => {
    const name = String(field.name);
    const path = prefix ? `${prefix}.${name}` : name;
    const value = ownValue(data, name);
    const own = { field, path };
    if (field.type === 'group' && objectValue(value))
      return [own, ...instances(field.fields ?? [], value, path)];
    if (!['array', 'blocks'].includes(field.type) || !Array.isArray(value)) return [own];
    const nested = value.flatMap((item) => {
      if (!objectValue(item) || typeof item['id'] !== 'string') return [];
      const childFields =
        field.type === 'blocks'
          ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
          : (field.fields ?? []);
      return instances(childFields, item, `${path}.${item['id']}`);
    });
    return [own, ...nested];
  });
}

export function assertSelect(
  collection: CollectionDefinition,
  select: readonly string[] | undefined,
): void {
  if (!select) return;
  const paths = new Set<string>([
    ...documentMetadataFields,
    ...fieldPaths(collection.fields).map((entry) => entry.path),
  ]);
  if (new Set(select).size !== select.length || select.some((path) => !paths.has(path)))
    fail('invalid_input');
}
