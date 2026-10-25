import { fail } from '@new-cms/cms/platform/contracts';
import { dataFields } from '../fields/structure.ts';
import { objectValue, ownValue } from '../fields/json-value.ts';
import type { FieldDefinition, JsonValue, DocumentData } from '../definition.ts';

function projectObject(fields: readonly FieldDefinition[], value: DocumentData): DocumentData {
  return Object.fromEntries(
    dataFields(fields).flatMap((field) => {
      const name = String(field.name);
      const child = ownValue(value, name);
      return child === undefined ? [] : [[name, projectDefault(field, child)]];
    }),
  );
}

function projectItem(field: FieldDefinition, value: JsonValue): JsonValue {
  if (!objectValue(value)) fail('invalid_input');
  const blockType = ownValue(value, 'blockType');
  const fields =
    field.type === 'blocks'
      ? field.blocks?.find((block) => block.key === blockType)?.fields
      : field.fields;
  if (!fields) fail('invalid_input');
  const id = ownValue(value, 'id');
  return {
    ...projectObject(fields, value),
    ...(id === undefined ? {} : { id }),
    ...(blockType === undefined ? {} : { blockType }),
  };
}

export function projectDefault(field: FieldDefinition, value: JsonValue): JsonValue {
  if (value === null) return null;
  if (field.type === 'group') {
    if (!objectValue(value)) fail('invalid_input');
    return projectObject(field.fields ?? [], value);
  }
  if (field.type === 'array' || field.type === 'blocks') {
    if (!Array.isArray(value)) fail('invalid_input');
    return value.map((item) => projectItem(field, item));
  }
  return structuredClone(value);
}
