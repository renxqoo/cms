import type { EditorNode } from '../../contracts/editor';
import { isFieldData, sameJson } from '../fields/data';
import { writablePatch } from '../fields/writable-data';
import { initializeFieldData, newFieldData } from '../fields/initialize-data';
import type { EditorSnapshot } from './read-editor';
import type { FieldData, JsonValue } from '../fields/types';
import type { DocumentChannelState, ContentFailure } from './channel-types';
export function documentDirty(state: DocumentChannelState) {
  return (
    state.snapshot.document === null ||
    Object.keys(
      writablePatch(state.snapshot.editor.layout, state.snapshot.document.data, state.draft),
    ).length > 0
  );
}
export function actionAllowed(
  state: DocumentChannelState,
  operation: string,
  can: (operation: string) => boolean,
) {
  return (
    can(operation) &&
    state.snapshot.editor.actions.some(
      (action) => action.operationId === operation && action.state !== 'denied',
    )
  );
}
export function patchMatches(
  layout: readonly EditorNode[],
  patch: FieldData,
  data: FieldData,
): boolean {
  return Object.entries(patch).every(([key, value]) => {
    const node = findNode(layout, key);
    const current = data[key];
    if (!node) return namedTabMatches(layout, key, { value, current });
    return fieldMatches(node, value, current);
  });
}
function namedTabMatches(
  layout: readonly EditorNode[],
  key: string,
  { value, current }: { value: JsonValue; current: JsonValue | undefined },
) {
  const tab = layout.flatMap((node) => node.tabs ?? []).find((item) => item.name === key);
  return Boolean(
    tab && isFieldData(value) && isFieldData(current) && patchMatches(tab.children, value, current),
  );
}
function findNode(layout: readonly EditorNode[], name: string): EditorNode | undefined {
  for (const node of layout) {
    if (node.name === name) return node;
    if (!node.name) {
      const found =
        findNode(node.children ?? [], name) ??
        findNode(node.tabs?.filter((tab) => !tab.name).flatMap((tab) => tab.children) ?? [], name);
      if (found) return found;
    }
  }
  return undefined;
}
function fieldMatches(node: EditorNode, value: JsonValue, current: JsonValue | undefined): boolean {
  if (node.type === 'group' && isFieldData(value) && isFieldData(current))
    return patchMatches(node.children ?? [], value, current);
  if (
    (node.type === 'array' || node.type === 'blocks') &&
    Array.isArray(value) &&
    Array.isArray(current)
  )
    return (
      value.length === current.length &&
      value.every((row, index) => rowMatches(node, row, current[index]))
    );
  return sameJson(value, current);
}
function rowMatches(node: EditorNode, row: JsonValue, current: JsonValue | undefined) {
  if (!isFieldData(row) || !isFieldData(current) || row['id'] !== current['id']) return false;
  if (node.type === 'blocks' && row['blockType'] !== current['blockType']) return false;
  const children =
    node.type === 'blocks'
      ? node.blocks?.find((block) => block.key === row['blockType'])?.children
      : node.children;
  const values = Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'id' && key !== 'blockType'),
  );
  return patchMatches(children ?? [], values, current);
}
export function mergeEditorPatch(
  layout: readonly EditorNode[],
  base: FieldData,
  patch: FieldData,
): FieldData {
  let result = { ...base };
  for (const node of layout) {
    if (node.name && Object.hasOwn(patch, node.name)) {
      const value = patch[node.name];
      if (value !== undefined) result[node.name] = mergeField(node, base[node.name], value);
    } else if (!node.name) {
      result = mergeEditorPatch(node.children ?? [], result, patch);
      result = mergeTabs(node, result, patch);
    }
  }
  return result;
}
function mergeTabs(node: EditorNode, base: FieldData, patch: FieldData) {
  let result = { ...base };
  for (const tab of node.tabs ?? []) {
    if (!tab.name) result = mergeEditorPatch(tab.children, result, patch);
    else {
      const value = patch[tab.name];
      const previous = result[tab.name];
      if (isFieldData(value))
        result[tab.name] = mergeEditorPatch(
          tab.children,
          isFieldData(previous) ? previous : {},
          value,
        );
    }
  }
  return result;
}
function mergeField(
  node: EditorNode,
  previous: JsonValue | undefined,
  value: JsonValue,
): JsonValue {
  if (node.type === 'group' && isFieldData(value))
    return mergeEditorPatch(node.children ?? [], isFieldData(previous) ? previous : {}, value);
  if ((node.type === 'array' || node.type === 'blocks') && Array.isArray(value))
    return value.map((row) => mergeRow(node, previous, row));
  return value;
}
function mergeRow(node: EditorNode, previous: JsonValue | undefined, row: JsonValue): JsonValue {
  if (!isFieldData(row)) return row;
  const before = Array.isArray(previous)
    ? previous.find(
        (item) =>
          isFieldData(item) &&
          item['id'] === row['id'] &&
          (node.type !== 'blocks' || item['blockType'] === row['blockType']),
      )
    : undefined;
  const children =
    node.type === 'blocks'
      ? node.blocks?.find((block) => block.key === row['blockType'])?.children
      : node.children;
  const identity = {
    ...(typeof row['id'] === 'string' ? { id: row['id'] } : {}),
    ...(typeof row['blockType'] === 'string' ? { blockType: row['blockType'] } : {}),
  };
  return {
    ...mergeEditorPatch(children ?? [], isFieldData(before) ? before : {}, row),
    ...identity,
  };
}

export function fieldData(snapshot: EditorSnapshot): FieldData {
  return snapshot.document
    ? initializeFieldData(snapshot.editor.layout, snapshot.document.data, () => crypto.randomUUID())
    : newFieldData(snapshot.editor.layout, () => crypto.randomUUID());
}
export function sameRevision(next: EditorSnapshot, current: EditorSnapshot) {
  return (
    snapshotIdentityMatches(next, current) &&
    next.document?.revision === current.document?.revision &&
    next.collection.mappingFingerprint === current.collection.mappingFingerprint &&
    next.collection.behaviorHash === current.collection.behaviorHash &&
    next.collection.schemaVersion === current.collection.schemaVersion
  );
}

export function initialChannelState(initial: EditorSnapshot): DocumentChannelState {
  return {
    snapshot: initial,
    draft: fieldData(initial),
    generation: 0,
    completion: 0,
    reset: 0,
    phase: 'idle',
    pending: null,
    error: null,
    inspectionError: null,
    remote: null,
    invalid: {},
    autosave: false,
    uploading: false,
    success: false,
    receipt: null,
  };
}

export function snapshotIdentityMatches(next: EditorSnapshot, current: EditorSnapshot) {
  return (
    next.collection.key === current.collection.key &&
    next.editor.locale === current.editor.locale &&
    next.editor.mode === current.editor.mode &&
    next.document?.id === current.document?.id
  );
}
export function olderSnapshot(next: EditorSnapshot, current: EditorSnapshot) {
  return (
    snapshotIdentityMatches(next, current) &&
    next.document !== null &&
    current.document !== null &&
    next.document.revision < current.document.revision
  );
}

export function failedWriteState(
  state: DocumentChannelState,
  error: ContentFailure,
): DocumentChannelState {
  return {
    ...state,
    phase: error.uncertain || error.error.code === 'version_conflict' ? 'blocked' : 'idle',
    error,
  };
}
