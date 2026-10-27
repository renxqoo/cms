import { equalFieldValue, isFieldData } from '../fields/data';
import type { EditorNode } from '../../contracts/editor';
import type { FieldData, JsonValue } from '../fields/types';

function objectValue(value: JsonValue | undefined): FieldData {
  return isFieldData(value) ? value : {};
}
function sharedRows(
  node: EditorNode,
  input: { before: JsonValue | undefined; next: JsonValue[]; other: JsonValue | undefined },
): JsonValue[] {
  const { before, next, other } = input;
  const old = Array.isArray(before) ? before : [];
  const peers = Array.isArray(other) ? other : [];
  return next.map((row) => {
    if (!isFieldData(row)) return row;
    const fields =
      node.type === 'blocks'
        ? (node.blocks?.find((block) => block.key === row['blockType'])?.children ?? [])
        : (node.children ?? []);
    const previous = old.find(
      (entry) =>
        isFieldData(entry) && entry['id'] === row['id'] && entry['blockType'] === row['blockType'],
    );
    const peer = peers.find(
      (entry) =>
        isFieldData(entry) && entry['id'] === row['id'] && entry['blockType'] === row['blockType'],
    );
    return {
      ...(row['id'] === undefined ? {} : { id: row['id'] }),
      ...(row['blockType'] === undefined ? {} : { blockType: row['blockType'] }),
      ...synchronizeSharedValues({
        layout: fields,
        before: objectValue(previous),
        next: row,
        other: objectValue(peer),
      }),
    };
  });
}

interface SyncInput {
  layout: readonly EditorNode[];
  before: FieldData;
  next: FieldData;
  other: FieldData;
}
export function synchronizeSharedValues(input: SyncInput): FieldData {
  let result = { ...input.other };
  for (const node of input.layout) {
    if (node.localized || node.write === 'denied' || ['join', 'ui'].includes(node.type)) continue;
    if (!node.name) {
      result = synchronizeLayout(node, input, result);
      continue;
    }
    const before = input.before[node.name];
    const next = input.next[node.name];
    if (next === undefined || equalFieldValue(before, next)) continue;
    if (node.type === 'group' && isFieldData(next))
      result[node.name] = synchronizeSharedValues({
        layout: node.children ?? [],
        before: objectValue(before),
        next,
        other: objectValue(result[node.name]),
      });
    else if (['array', 'blocks'].includes(node.type) && Array.isArray(next))
      result[node.name] = sharedRows(node, { before, next, other: result[node.name] });
    else result[node.name] = structuredClone(next);
  }
  return result;
}

function synchronizeLayout(node: EditorNode, input: SyncInput, result: FieldData): FieldData {
  result = synchronizeSharedValues({ ...input, layout: node.children ?? [], other: result });
  for (const tab of node.tabs ?? []) {
    if (!tab.name)
      result = synchronizeSharedValues({ ...input, layout: tab.children, other: result });
    else
      result[tab.name] = synchronizeSharedValues({
        layout: tab.children,
        before: objectValue(input.before[tab.name]),
        next: objectValue(input.next[tab.name]),
        other: objectValue(result[tab.name]),
      });
  }
  return result;
}
