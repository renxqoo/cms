import { ownValue } from './json-value.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { documentMetadataFields } from '../model.ts';
import type { CollectionDefinition } from '../definition.ts';
import { objectValue } from './json-value.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';

export function allFieldDefinitions(fields: readonly FieldDefinition[]): FieldDefinition[] {
  return fields.flatMap((field) => [
    field,
    ...allFieldDefinitions(field.fields ?? []),
    ...(field.blocks ?? []).flatMap((block) => allFieldDefinitions(block.fields)),
    ...(field.tabs ?? []).flatMap((tab) => allFieldDefinitions(tab.fields)),
  ]);
}

export function dataFields(fields: readonly FieldDefinition[]): FieldDefinition[] {
  return namedFields(fields).filter((field) => field.type !== 'ui');
}
export function namedFields(fields: readonly FieldDefinition[]): FieldDefinition[] {
  return fields.flatMap((field) => {
    if (field.type === 'row' || field.type === 'collapsible')
      return namedFields(field.fields ?? []);
    if (field.type !== 'tabs') return [field];
    return (field.tabs ?? []).flatMap((tab) =>
      tab.name
        ? [
            {
              id: tab.id,
              name: tab.name,
              label: tab.label,
              type: 'group' as const,
              fields: namedFields(tab.fields),
            },
          ]
        : namedFields(tab.fields),
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
  options: { includeUi?: boolean } = {},
): { path: string; field: FieldDefinition; repeated: boolean }[] {
  return (options.includeUi ? namedFields(fields) : dataFields(fields)).flatMap((field) => {
    const path = prefix ? `${prefix}.${field.name}` : String(field.name);
    const own = {
      path,
      field,
      repeated: field.type === 'array' || field.type === 'blocks' || field.hasMany === true,
    };
    return [
      own,
      ...fieldPaths(
        options.includeUi
          ? [...(field.fields ?? []), ...(field.blocks ?? []).flatMap((block) => block.fields)]
          : children(field),
        path,
        options,
      ).map((child) => ({
        ...child,
        repeated: own.repeated || child.repeated,
      })),
    ];
  });
}

export function dataFieldInstances(input: {
  fields: readonly FieldDefinition[];
  data: DocumentData;
  includeUi?: boolean;
}): { field: FieldDefinition; path: string }[] {
  return instances(input.fields, input.data, { prefix: '', includeUi: input.includeUi === true });
}
function instances(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  input: { prefix: string; includeUi: boolean },
): { field: FieldDefinition; path: string }[] {
  return (input.includeUi ? namedFields(fields) : dataFields(fields)).flatMap((field) => {
    const name = String(field.name);
    const path = input.prefix ? `${input.prefix}.${name}` : name;
    const value = ownValue(data, name);
    const own = { field, path };
    if (field.type === 'group' && objectValue(value))
      return [own, ...instances(field.fields ?? [], value, { ...input, prefix: path })];
    if (!['array', 'blocks'].includes(field.type) || !Array.isArray(value)) return [own];
    const nested = value.flatMap((item) => {
      if (!objectValue(item) || typeof item['id'] !== 'string') return [];
      const childFields =
        field.type === 'blocks'
          ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
          : (field.fields ?? []);
      return instances(childFields, item, { ...input, prefix: `${path}.${item['id']}` });
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
