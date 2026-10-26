import { fail } from '@new-cms/cms/platform/contracts';
import type { CompiledCollection, FieldMapping } from '../../model.ts';
import type { DocumentData, JsonValue } from '../../definition.ts';
import { objectValue, ownValue } from '../../fields/json-value.ts';

export function projectionFields(
  collection: CompiledCollection,
  projection?: readonly string[],
): readonly FieldMapping[] {
  if (projection === undefined) return collection.flat;
  if (
    new Set(projection).size !== projection.length ||
    projection.some((path) => !collection.flat.some((field) => field.path === path))
  )
    fail('invalid_input');
  return collection.flat.filter((field) =>
    projection.some(
      (path) =>
        path === field.path ||
        path.startsWith(`${field.path}.`) ||
        field.path.startsWith(`${path}.`),
    ),
  );
}
export function projectReadData(
  collection: CompiledCollection,
  data: DocumentData,
  projection?: readonly string[],
): DocumentData {
  if (projection === undefined) return data;
  return projectFields(collection.fields, data, projection);
}
function projectFields(
  fields: readonly FieldMapping[],
  data: DocumentData,
  projection: readonly string[],
): DocumentData {
  const result: DocumentData = {};
  for (const field of fields) {
    const name = String(field.field.name),
      value = ownValue(data, name);
    if (value === undefined) continue;
    if (projection.some((path) => path === field.path || field.path.startsWith(`${path}.`)))
      result[name] = value;
    else if (projection.some((path) => path.startsWith(`${field.path}.`)))
      result[name] = projectValue(field, value, projection);
  }
  return result;
}
function projectValue(
  field: FieldMapping,
  value: JsonValue,
  projection: readonly string[],
): JsonValue {
  if (value === null) return null;
  if (field.field.type === 'group' && objectValue(value))
    return projectFields(field.children, value, projection);
  if (!field.structural || !Array.isArray(value)) fail('invalid_input');
  return value.map((row) => {
    if (!objectValue(row)) fail('invalid_input');
    const children = field.children.filter(
      (child) => !child.blockKey || child.blockKey === row['blockType'],
    );
    return {
      ...(row['id'] === undefined ? {} : { id: row['id'] }),
      ...(row['blockType'] === undefined ? {} : { blockType: row['blockType'] }),
      ...projectFields(children, row, projection),
    };
  });
}
