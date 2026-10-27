import { isFieldData } from './data';
import type { EditorNode } from '../../contracts/editor';
import type { FieldData, JsonValue } from './types';

export function copyFieldData(layout: readonly EditorNode[], data: FieldData): FieldData {
  let result = structuredClone(data);
  for (const node of layout) {
    if (!node.name) {
      result = copyFieldData(node.children ?? [], result);
      result = copyTabs(node, result);
      continue;
    }
    if (node.disableDuplicate) {
      const { [node.name]: _excluded, ...remaining } = result;
      result = remaining;
      if (node.constraints.defaultValue !== undefined)
        result[node.name] = structuredClone(node.constraints.defaultValue);
      continue;
    }
    const value = result[node.name];
    if (node.type === 'group' && isFieldData(value))
      result[node.name] = copyFieldData(node.children ?? [], value);
    else if (['array', 'blocks'].includes(node.type) && Array.isArray(value))
      result[node.name] = value.map((row) => copyRow(node, row));
  }
  return result;
}
function copyTabs(node: EditorNode, data: FieldData): FieldData {
  let result = data;
  for (const tab of node.tabs ?? []) {
    if (!tab.name) result = copyFieldData(tab.children, result);
    else {
      const value = result[tab.name];
      if (isFieldData(value)) result[tab.name] = copyFieldData(tab.children, value);
    }
  }
  return result;
}
function copyRow(node: EditorNode, value: JsonValue): JsonValue {
  if (!isFieldData(value)) return value;
  const children =
    node.type === 'blocks'
      ? node.blocks?.find((block) => block.key === value['blockType'])?.children
      : node.children;
  return copyFieldData(children ?? [], value);
}
