import { ownValue } from './json-value.ts';
import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  FieldDefinition,
  JsonValue,
  ReferenceValue,
} from '../definition.ts';
import { dataFields } from './structure.ts';
import { objectValue } from './json-value.ts';
import { richTextReferences } from './rich-text.ts';

function relations(field: FieldDefinition, value: JsonValue, path: string): ReferenceValue[] {
  const values = field.hasMany && Array.isArray(value) ? value : [value];
  return values.flatMap((item, index) => {
    if (
      !objectValue(item) ||
      typeof item['collection'] !== 'string' ||
      typeof item['id'] !== 'string'
    )
      return [];
    return [
      {
        collection: item['collection'],
        id: item['id'],
        path: field.hasMany ? `${path}.${index}` : path,
        fieldId: field.id,
        onDelete: field.onDelete ?? 'restrict',
        media: field.type === 'upload',
      },
    ];
  });
}
interface ReferenceContext {
  collection: CollectionDefinition;
  limits: ContentLimits;
  prefix: string;
}
function fromValue(
  field: FieldDefinition,
  value: JsonValue,
  input: ReferenceContext,
): ReferenceValue[] {
  const path = input.prefix;
  if (field.type === 'relationship' || field.type === 'upload')
    return relations(field, value, path);
  if (field.type === 'richText')
    return richTextReferences({
      value,
      path,
      fieldId: field.id,
      limits: input.limits,
      registrations: input.collection.richTextNodes ?? [],
    });
  if (field.type === 'group' && objectValue(value))
    return visit(field.fields ?? [], value, { ...input, prefix: path });
  if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value)) {
    return value.flatMap((item, index) => {
      if (!objectValue(item)) return [];
      const fields =
        field.type === 'blocks'
          ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
          : (field.fields ?? []);
      return visit(fields, item, {
        ...input,
        prefix: `${path}.${typeof item['id'] === 'string' ? item['id'] : index}`,
      });
    });
  }
  return [];
}
function visit(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  input: ReferenceContext,
): ReferenceValue[] {
  const { prefix } = input;
  return dataFields(fields).flatMap((field) => {
    const name = String(field.name);
    const value = ownValue(data, name);
    return value === undefined
      ? []
      : fromValue(field, value, { ...input, prefix: prefix ? `${prefix}.${name}` : name });
  });
}
export function collectReferences(input: {
  collection: CollectionDefinition;
  data: DocumentData;
  locale: string;
  limits: ContentLimits;
}): ReferenceValue[] {
  return visit(input.collection.fields, input.data, { ...input, prefix: '' });
}
