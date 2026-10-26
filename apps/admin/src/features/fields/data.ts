import type { EditorNode } from '../../contracts/editor';
import type { FieldData, FieldPath, JsonValue } from './types';

export function isFieldData(value: unknown): value is FieldData {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return (
      left.length === right.length && left.every((value, index) => sameJson(value, right[index]))
    );
  if (!isFieldData(left) || !isFieldData(right)) return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
  );
}

export function fieldValue(data: JsonValue | undefined, path: FieldPath): JsonValue | undefined {
  let value = data;
  for (const segment of path) {
    if (Array.isArray(value) && typeof segment === 'number') value = value[segment];
    else if (isFieldData(value) && Object.hasOwn(value, segment)) value = value[segment];
    else return undefined;
  }
  return value;
}

export function changeField(data: FieldData, path: FieldPath, value: JsonValue): FieldData {
  const result = changeValue(data, path, value);
  return isFieldData(result) ? result : data;
}

function changeValue(current: JsonValue | undefined, path: FieldPath, value: JsonValue): JsonValue {
  const [segment, ...rest] = path;
  if (segment === undefined) return value;
  if (typeof segment === 'number') {
    const rows = Array.isArray(current) ? current : [];
    return rows.map((row, index) => (index === segment ? changeValue(row, rest, value) : row));
  }
  const record = isFieldData(current) ? current : {};
  const before = Object.hasOwn(record, segment) ? record[segment] : undefined;
  return { ...record, [segment]: changeValue(before, rest, value) };
}

export function pathName(path: FieldPath): string {
  return path.map(String).join('.');
}

export function rowData(value: JsonValue | undefined): FieldData[] {
  return Array.isArray(value) ? value.filter(isFieldData) : [];
}

export function addFieldRow(input: {
  value: FieldData[];
  defaults: FieldData;
  id: string;
  blockType?: string;
}): FieldData[] {
  return [
    ...input.value,
    {
      ...structuredClone(input.defaults),
      id: input.id,
      ...(input.blockType ? { blockType: input.blockType } : {}),
    },
  ];
}

export function moveFieldRow(value: FieldData[], from: number, to: number): FieldData[] {
  if (from < 0 || to < 0 || from >= value.length || to >= value.length || from === to) return value;
  const result = [...value];
  const [moved] = result.splice(from, 1);
  if (moved) result.splice(to, 0, moved);
  return result;
}

export function editorDefaults(layout: readonly EditorNode[]): FieldData {
  return layout.reduce<FieldData>((result, node) => {
    if (node.write === 'denied' || node.type === 'join') return result;
    const nested = editorDefaults(node.children ?? []);
    if (!node.name) return { ...result, ...nested, ...tabDefaults(node) };
    const value = node.constraints.defaultValue;
    if (value !== undefined) return { ...result, [node.name]: structuredClone(value) };
    if (node.type === 'group' && Object.keys(nested).length > 0)
      return { ...result, [node.name]: nested };
    return { ...result, ...tabDefaults(node) };
  }, {});
}

function tabDefaults(node: EditorNode): FieldData {
  return (node.tabs ?? []).reduce<FieldData>((result, tab) => {
    const data = editorDefaults(tab.children);
    return tab.name ? { ...result, [tab.name]: data } : { ...result, ...data };
  }, {});
}
