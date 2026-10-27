import { randomUUID } from 'node:crypto';
import { dataFields } from '../fields/structure.ts';
import { objectValue } from '../fields/json-value.ts';
import type { DocumentData, FieldDefinition, JsonValue } from '../definition.ts';
import type { LocaleData } from './prepare-write.ts';

function childFields(field: FieldDefinition, row: DocumentData) {
  return field.type === 'blocks'
    ? (field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [])
    : (field.fields ?? []);
}
function clearFields(fields: readonly FieldDefinition[], data: DocumentData): DocumentData {
  let result = structuredClone(data);
  for (const field of dataFields(fields)) {
    const name = String(field.name),
      value = result[name];
    if (field.disableDuplicate) {
      const { [name]: _excluded, ...remaining } = result;
      result = remaining;
      continue;
    }
    if (field.type === 'group' && objectValue(value))
      result[name] = clearFields(field.fields ?? [], value);
    else if (['array', 'blocks'].includes(field.type) && Array.isArray(value))
      result[name] = value.map((row) =>
        objectValue(row) ? clearFields(childFields(field, row), row) : row,
      );
  }
  return result;
}
export function clearDuplicateFields(
  fields: readonly FieldDefinition[],
  data: LocaleData,
): LocaleData {
  return Object.fromEntries(
    Object.entries(data).map(([locale, value]) => [locale, clearFields(fields, value)]),
  );
}
interface RebaseState {
  ids: Map<string, string>;
  paths: Record<string, string>;
  locale: string;
  localized: boolean;
  from: string;
  to: string;
}
function fieldPath(prefix: string, name: string) {
  return prefix ? `${prefix}.${name}` : name;
}
function rebaseFields(
  fields: readonly FieldDefinition[],
  data: DocumentData,
  state: RebaseState,
): DocumentData {
  const result = { ...data };
  for (const field of dataFields(fields)) {
    const name = String(field.name),
      value = result[name];
    const next = {
      ...state,
      localized: state.localized || field.localized === true,
      from: fieldPath(state.from, name),
      to: fieldPath(state.to, name),
    };
    if (field.type === 'group' && objectValue(value))
      result[name] = rebaseFields(field.fields ?? [], value, next);
    else if (['array', 'blocks'].includes(field.type) && Array.isArray(value))
      result[name] = rebaseRows(field, value, next);
  }
  return result;
}
function rebaseRows(field: FieldDefinition, rows: JsonValue[], state: RebaseState): JsonValue[] {
  return rows.map((row, index) => {
    if (!objectValue(row)) return row;
    const old = typeof row['id'] === 'string' ? row['id'] : String(index);
    const from = fieldPath(state.from, old);
    const key = `${state.localized ? state.locale : 'shared'}:${from}`;
    let id = state.ids.get(key);
    if (!id) {
      id = randomUUID();
      state.ids.set(key, id);
    }
    const to = fieldPath(state.to, id);
    state.paths[`${state.locale}:${to}`] = `${state.locale}:${from}`;
    return { ...rebaseFields(childFields(field, row), row, { ...state, from, to }), id };
  });
}
export function rebaseDuplicateRows(fields: readonly FieldDefinition[], data: LocaleData) {
  const ids = new Map<string, string>();
  const paths: Record<string, string> = {};
  const dataByLocale = Object.fromEntries(
    Object.entries(data).map(([locale, value]) => [
      locale,
      rebaseFields(fields, value, { ids, paths, locale, localized: false, from: '', to: '' }),
    ]),
  );
  return { dataByLocale, paths };
}
