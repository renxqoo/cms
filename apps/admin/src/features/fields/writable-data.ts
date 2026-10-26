import type { EditorNode } from '../../contracts/editor';
import { equalFieldValue, isFieldData } from './data';
import type { FieldData, JsonValue } from './types';

export function writablePatch(
  layout: readonly EditorNode[],
  before: FieldData,
  after: FieldData,
): FieldData {
  return layout.reduce<FieldData>((patch, node) => {
    if (node.write === 'denied' || node.type === 'join') return patch;
    if (!node.name)
      return {
        ...patch,
        ...writablePatch(node.children ?? [], before, after),
        ...tabPatch(node, before, after),
      };
    if (!Object.hasOwn(after, node.name) || equalFieldValue(before[node.name], after[node.name]))
      return patch;
    const next = after[node.name];
    const previous = before[node.name];
    if (next === undefined) return patch;
    if (node.type === 'group' && isFieldData(next)) {
      const nested = writablePatch(
        node.children ?? [],
        isFieldData(previous) ? previous : {},
        next,
      );
      return Object.keys(nested).length > 0 ? { ...patch, [node.name]: nested } : patch;
    }
    return { ...patch, [node.name]: writableValue(node, next, previous) };
  }, {});
}

function tabPatch(node: EditorNode, before: FieldData, after: FieldData): FieldData {
  return (node.tabs ?? []).reduce<FieldData>((patch, tab) => {
    if (!tab.name) return { ...patch, ...writablePatch(tab.children, before, after) };
    const next = after[tab.name];
    if (!isFieldData(next)) return patch;
    const previous = before[tab.name];
    const nested = writablePatch(tab.children, isFieldData(previous) ? previous : {}, next);
    return Object.keys(nested).length > 0 ? { ...patch, [tab.name]: nested } : patch;
  }, {});
}

export function writableValue(node: EditorNode, value: JsonValue, previous?: JsonValue): JsonValue {
  if (node.type === 'group' && isFieldData(value))
    return writablePatch(node.children ?? [], isFieldData(previous) ? previous : {}, value);
  if ((node.type === 'array' || node.type === 'blocks') && Array.isArray(value))
    return value.map((row) => writableRow(node, row, previousRow(node, previous, row)));
  return structuredClone(value);
}

function writableRow(node: EditorNode, row: JsonValue, previous: FieldData): JsonValue {
  if (!isFieldData(row)) return row;
  const { blockType } = row;
  const children =
    node.type === 'blocks'
      ? node.blocks?.find((block) => block.key === blockType)?.children
      : node.children;
  if (node.type === 'blocks' && !children) return structuredClone(row);
  const identity = typeof row['id'] === 'string' ? { id: row['id'] } : {};
  const kind = typeof blockType === 'string' ? { blockType } : {};
  return { ...identity, ...kind, ...writablePatch(children ?? [], previous, row) };
}

function previousRow(node: EditorNode, value: JsonValue | undefined, row: JsonValue): FieldData {
  if (!Array.isArray(value) || !isFieldData(row) || typeof row['id'] !== 'string') return {};
  const before = value.find(
    (candidate) =>
      isFieldData(candidate) &&
      candidate['id'] === row['id'] &&
      (node.type !== 'blocks' || candidate['blockType'] === row['blockType']),
  );
  return isFieldData(before) ? before : {};
}
