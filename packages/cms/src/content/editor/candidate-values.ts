import { clearDuplicateFields } from '../documents/duplicate-data.ts';
import type { EditorContext } from './context.ts';
import { isDeepStrictEqual } from 'node:util';
import { fail } from '@new-cms/cms/platform/contracts';
import { dataFields } from '../fields/structure.ts';
import { objectValue, ownValue } from '../fields/json-value.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '../definition.ts';

interface Input {
  fields: readonly FieldDefinition[];
  previous: DocumentData;
  supplied: DocumentData;
}

function rowValue(
  field: FieldDefinition,
  previous: JsonValue | undefined,
  value: JsonValue,
): JsonValue {
  if (!objectValue(value)) return structuredClone(value);
  const fields =
    field.type === 'blocks'
      ? (field.blocks?.find((block) => block.key === value['blockType'])?.fields ?? [])
      : (field.fields ?? []);
  const old = Array.isArray(previous)
    ? previous.find((row) => objectValue(row) && row['id'] === value['id'])
    : undefined;
  const { id, blockType, ...supplied } = value;
  const prior = objectValue(old) ? old : {};
  const { id: _id, blockType: _kind, ...body } = prior;
  return {
    ...mergeCandidateValues({ fields, previous: body, supplied }),
    ...(id === undefined ? {} : { id }),
    ...(blockType === undefined ? {} : { blockType }),
  };
}

function valueFor(
  field: FieldDefinition,
  previous: JsonValue | undefined,
  value: JsonValue,
): JsonValue {
  if (field.type === 'group' && objectValue(value))
    return mergeCandidateValues({
      fields: field.fields ?? [],
      previous: objectValue(previous) ? previous : {},
      supplied: value,
    });
  if ((field.type === 'array' || field.type === 'blocks') && Array.isArray(value))
    return value.map((row) => rowValue(field, previous, row));
  return structuredClone(value);
}

export function mergeCandidateValues(input: Input): DocumentData {
  const definitions = new Map(dataFields(input.fields).map((field) => [String(field.name), field]));
  const result = structuredClone(input.previous);
  for (const [name, value] of Object.entries(input.supplied)) {
    const field = definitions.get(name);
    if (!field) fail('invalid_input');
    const previous = ownValue(input.previous, name);
    if (isDeepStrictEqual(previous, value)) continue;
    if (field.virtual || field.type === 'join') fail('forbidden');
    result[name] = valueFor(field, previous, value);
  }
  return result;
}

export function editorSourceData(
  context: Pick<EditorContext, 'input' | 'state'>,
  data: DocumentData,
): DocumentData {
  if (context.input.intent !== 'copy') return data;
  return (
    clearDuplicateFields(context.state.collection.fields, { [context.state.locale]: data })[
      context.state.locale
    ] ?? {}
  );
}
