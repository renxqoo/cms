import { randomUUID } from 'node:crypto';
import { dataFields } from '../fields/structure.ts';
import { objectValue, ownValue } from '../fields/json-value.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '../definition.ts';

interface Frame {
  from: DocumentData;
  to: DocumentData;
  fromPath: string;
  toPath: string;
  localized: boolean;
}
interface ValueFrame extends Frame {
  source: JsonValue;
  target: JsonValue | undefined;
}
interface CopyState {
  overwrite: boolean;
  paths: Record<string, string>;
}
function path(prefix: string, name: string) {
  return prefix ? `${prefix}.${name}` : name;
}
function childFields(field: FieldDefinition, row: DocumentData) {
  return field.type === 'blocks'
    ? (field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [])
    : (field.fields ?? []);
}
function rowId(row: DocumentData, index: number) {
  return typeof row['id'] === 'string' ? row['id'] : String(index);
}
function copiedRows(
  state: CopyState,
  field: FieldDefinition,
  frame: Frame & { rows: JsonValue[] },
) {
  return frame.rows.filter(objectValue).map((row, index) => {
    const id = randomUUID();
    const data = fields({ ...state, overwrite: true }, childFields(field, row), {
      from: row,
      to: {},
      fromPath: path(frame.fromPath, rowId(row, index)),
      toPath: path(frame.toPath, id),
      localized: true,
    });
    return {
      ...data,
      id,
      ...(field.type === 'blocks' ? { blockType: row['blockType'] ?? null } : {}),
    };
  });
}
function mergedRows(
  state: CopyState,
  field: FieldDefinition,
  frame: Frame & { rows: JsonValue[]; sourceRows: JsonValue[] },
) {
  let changed = false;
  const result = frame.rows.map((row, index) => {
    if (!objectValue(row)) return row;
    const from = frame.localized
      ? frame.sourceRows[index]
      : frame.sourceRows.find((item) => objectValue(item) && item['id'] === row['id']);
    if (!objectValue(from) || (field.type === 'blocks' && from['blockType'] !== row['blockType']))
      return {
        id: row['id'] ?? null,
        ...(field.type === 'blocks' ? { blockType: row['blockType'] ?? null } : {}),
      };
    const data = fields(state, childFields(field, row), {
      from,
      to: row,
      fromPath: path(frame.fromPath, rowId(from, index)),
      toPath: path(frame.toPath, rowId(row, index)),
      localized: frame.localized,
    });
    if (Object.keys(data).length > 0) changed = true;
    return {
      ...data,
      id: row['id'] ?? null,
      ...(field.type === 'blocks' ? { blockType: row['blockType'] ?? null } : {}),
    };
  });
  return changed ? result : undefined;
}
function repeated(state: CopyState, field: FieldDefinition, frame: ValueFrame) {
  const { source: from, target: to } = frame;
  if (!Array.isArray(from))
    return frame.localized && (state.overwrite || to == null) ? from : undefined;
  if (frame.localized && (state.overwrite || to == null || (Array.isArray(to) && to.length === 0)))
    return copiedRows(state, field, { ...frame, rows: from });
  return Array.isArray(to)
    ? mergedRows(state, field, { ...frame, rows: to, sourceRows: from })
    : undefined;
}
function value(state: CopyState, field: FieldDefinition, frame: ValueFrame): JsonValue | undefined {
  const { source: from, target: to } = frame;
  if (field.type === 'group' && objectValue(from)) {
    const data = fields(state, field.fields ?? [], {
      ...frame,
      from,
      to: objectValue(to) ? to : {},
    });
    return Object.keys(data).length > 0 ? data : undefined;
  }
  if (field.type === 'array' || field.type === 'blocks') return repeated(state, field, frame);
  if (!frame.localized || (!state.overwrite && to != null)) return undefined;
  state.paths[frame.toPath] = frame.fromPath;
  return structuredClone(from);
}
function fields(
  state: CopyState,
  definitions: readonly FieldDefinition[],
  frame: Frame,
): DocumentData {
  const result: DocumentData = {};
  for (const field of dataFields(definitions)) {
    if (field.virtual || field.type === 'join') continue;
    const name = String(field.name);
    const from = ownValue(frame.from, name);
    if (from === undefined) continue;
    const copied = value(state, field, {
      ...frame,
      localized: frame.localized || field.localized === true,
      fromPath: path(frame.fromPath, name),
      toPath: path(frame.toPath, name),
      source: from,
      target: ownValue(frame.to, name),
    });
    if (copied !== undefined) result[name] = copied;
  }
  return result;
}
export function copyLocaleData(input: {
  fields: readonly FieldDefinition[];
  from: DocumentData;
  to: DocumentData;
  overwrite: boolean;
}) {
  const state: CopyState = { overwrite: input.overwrite, paths: {} };
  const data = fields(state, input.fields, {
    from: input.from,
    to: input.to,
    fromPath: '',
    toPath: '',
    localized: false,
  });
  return { data, paths: state.paths };
}
