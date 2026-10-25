import { isDeepStrictEqual } from 'node:util';
import { objectValue, ownValue } from '../fields/json-value.ts';
import { dataFields } from '../fields/structure.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '../definition.ts';

function rowPatch(
  field: FieldDefinition,
  previous: JsonValue | undefined,
  next: JsonValue,
): JsonValue {
  if (!objectValue(next)) return structuredClone(next);
  const fields =
    field.type === 'blocks'
      ? (field.blocks?.find((block) => block.key === next['blockType'])?.fields ?? [])
      : (field.fields ?? []);
  const data = snapshotPatch({ fields, previous: objectValue(previous) ? previous : {}, next });
  if (next['id'] !== undefined) data['id'] = next['id'];
  if (next['blockType'] !== undefined) data['blockType'] = next['blockType'];
  return data;
}

function valuePatch(
  field: FieldDefinition,
  previous: JsonValue | undefined,
  next: JsonValue,
): JsonValue {
  if (field.type === 'group' && objectValue(next))
    return snapshotPatch({
      fields: field.fields ?? [],
      previous: objectValue(previous) ? previous : {},
      next,
    });
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(previous) || !Array.isArray(next))
    return structuredClone(next);
  return next.map((item) => {
    const old = objectValue(item)
      ? previous.find((value) => objectValue(value) && value['id'] === item['id'])
      : undefined;
    return rowPatch(field, old, item);
  });
}

export function snapshotPatch(input: {
  fields: readonly FieldDefinition[];
  previous: DocumentData;
  next: DocumentData;
}): DocumentData {
  const patch: DocumentData = {};
  for (const field of dataFields(input.fields)) {
    const name = String(field.name);
    const previous = ownValue(input.previous, name);
    const next = ownValue(input.next, name);
    if (isDeepStrictEqual(previous, next)) continue;
    patch[name] = next === undefined ? null : valuePatch(field, previous, next);
  }
  return patch;
}
