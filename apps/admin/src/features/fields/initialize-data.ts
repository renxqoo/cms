import type { EditorNode } from '../../contracts/editor';
import { editorDefaults, isFieldData } from './data';
import type { FieldData, JsonValue } from './types';
import { writableValue } from './writable-data';

export function initializeFieldData(
  layout: readonly EditorNode[],
  data: FieldData,
  createId: () => string,
): FieldData {
  let result = { ...data };
  for (const node of layout) {
    if (!node.name) {
      result = initializeFieldData(node.children ?? [], result, createId);
      result = initializeTabs(node, result, createId);
    } else if (Object.hasOwn(result, node.name))
      result = { ...result, [node.name]: initializeValue(node, result[node.name], createId) };
  }
  return result;
}

function initializeTabs(node: EditorNode, data: FieldData, createId: () => string): FieldData {
  let result = { ...data };
  for (const tab of node.tabs ?? []) {
    if (!tab.name) result = initializeFieldData(tab.children, result, createId);
    else {
      const current = result[tab.name];
      if (isFieldData(current))
        result = { ...result, [tab.name]: initializeFieldData(tab.children, current, createId) };
    }
  }
  return result;
}

function initializeValue(
  node: EditorNode,
  value: JsonValue | undefined,
  createId: () => string,
): JsonValue {
  if (node.type === 'group' && isFieldData(value))
    return initializeFieldData(node.children ?? [], value, createId);
  if ((node.type === 'array' || node.type === 'blocks') && Array.isArray(value))
    return value.map((row) => initializeRow(node, row, createId));
  return value ?? null;
}

function initializeRow(node: EditorNode, row: JsonValue, createId: () => string): JsonValue {
  if (!isFieldData(row)) return row;
  const children =
    node.type === 'blocks'
      ? node.blocks?.find((block) => block.key === row['blockType'])?.children
      : node.children;
  return {
    ...initializeFieldData(children ?? [], row, createId),
    id: typeof row['id'] === 'string' ? row['id'] : createId(),
  };
}

export function newFieldData(layout: readonly EditorNode[], createId: () => string): FieldData {
  const defaults = editorDefaults(layout);
  const safe = layout.reduce<FieldData>((data, node) => {
    if (node.name && node.write !== 'denied' && Object.hasOwn(defaults, node.name)) {
      const value = defaults[node.name];
      if (value !== undefined) return { ...data, [node.name]: writableValue(node, value) };
    }
    return data;
  }, {});
  return initializeFieldData(layout, { ...defaults, ...safe }, createId);
}
