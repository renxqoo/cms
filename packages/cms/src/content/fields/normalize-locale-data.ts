import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import { z } from 'zod';
import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  FieldDefinition,
  JsonValue,
} from '../definition.ts';
import { assertJsonBudget } from './data-budget.ts';
import { objectValue } from './json-value.ts';
import { dataFields } from './structure.ts';
import { validateData } from './validate-data.ts';

interface NormalizeInput {
  collection: CollectionDefinition;
  current?: Readonly<Record<string, DocumentData>>;
  patches: Readonly<Record<string, DocumentData>>;
  limits: ContentLimits;
  applyDefaults?: boolean;
}
interface State extends NormalizeInput {
  requested: ReadonlySet<string>;
}
interface Frame {
  locale: string;
  current?: JsonValue | undefined;
  patch?: JsonValue | undefined;
  explicit: boolean;
  defaulted?: boolean | undefined;
}
interface ObjectFrame {
  locale: string;
  current: DocumentData;
  patch?: DocumentData;
  defaulted?: boolean | undefined;
}
interface Result {
  data: Map<string, JsonValue>;
  patches: Map<string, JsonValue>;
}
interface ObjectResult {
  data: Record<string, DocumentData>;
  patches: Record<string, DocumentData>;
}
function result(): Result {
  return { data: new Map(), patches: new Map() };
}
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (objectValue(value))
    return `{${Object.keys(value)
      .toSorted()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key] ?? null)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
function consistent<T extends JsonValue>(values: readonly T[]): T | undefined {
  const [first] = values;
  if (first !== undefined && values.some((value) => canonical(value) !== canonical(first)))
    fail('invalid_input');
  return first;
}
function candidates(frames: readonly Frame[]): { values: JsonValue[]; explicit: boolean } {
  const supplied = frames.filter((frame) => frame.explicit);
  const source =
    supplied.length > 0
      ? supplied.map((frame) => frame.patch)
      : frames.map((frame) => frame.current);
  return {
    values: source.filter((value): value is JsonValue => value !== undefined),
    explicit: supplied.length > 0,
  };
}
function scalar(state: State, field: FieldDefinition, frames: readonly Frame[]): Result {
  const selected = candidates(frames);
  const { validate: _validate, ...shape } = field;
  const normalized = selected.values.map(
    (value) =>
      validateData({
        collection: { ...state.collection, fields: [shape] },
        data: { [String(field.name)]: value },
        locale: frames[0]?.locale ?? state.collection.locales.default,
        mode: 'draft',
        limits: state.limits,
      })[String(field.name)] ?? null,
  );
  const value = consistent(normalized);
  const output = result();
  for (const frame of frames) {
    if (value !== undefined) output.data.set(frame.locale, structuredClone(value));
    if (selected.explicit && value !== undefined)
      output.patches.set(frame.locale, structuredClone(value));
  }
  return output;
}
function container(
  frames: readonly Frame[],
  type: 'group' | 'array',
): 'missing' | 'null' | 'value' {
  const { values } = candidates(frames);
  if (values.length === 0) return 'missing';
  if (values.every((value) => value === null)) return 'null';
  if (
    values.some(
      (value) => value === null || (type === 'group' ? !objectValue(value) : !Array.isArray(value)),
    )
  )
    fail('invalid_input');
  return 'value';
}
function nullContainer(frames: readonly Frame[]): Result {
  const output = result();
  const { explicit } = candidates(frames);
  for (const frame of frames) {
    output.data.set(frame.locale, null);
    if (explicit) output.patches.set(frame.locale, null);
  }
  return output;
}
function fields(
  state: State,
  definitions: readonly FieldDefinition[],
  frames: readonly ObjectFrame[],
): ObjectResult {
  const definitionsByName = new Map(
    dataFields(definitions)
      .filter((field) => field.type !== 'join')
      .map((field) => [String(field.name), field]),
  );
  const output: ObjectResult = { data: {}, patches: {} };
  for (const frame of frames) {
    for (const source of [frame.current, frame.patch])
      if (source && Object.keys(source).some((key) => !definitionsByName.has(key)))
        fail('invalid_input');
    output.data[frame.locale] = {};
    output.patches[frame.locale] = {};
  }
  for (const [name, field] of definitionsByName) {
    const inputs = frames.map((frame) => ({
      locale: frame.locale,
      current:
        Object.hasOwn(frame.current, name) &&
        !(frame.defaulted && field.localized && !state.requested.has(frame.locale))
          ? frame.current[name]
          : undefined,
      patch: frame.patch?.[name],
      explicit: frame.patch !== undefined && Object.hasOwn(frame.patch, name),
      defaulted: frame.defaulted,
    }));
    const resolved = resolve(state, field, inputs);
    for (const [locale, value] of resolved.data) (output.data[locale] ??= {})[name] = value;
    for (const [locale, value] of resolved.patches) (output.patches[locale] ??= {})[name] = value;
  }
  return output;
}
function group(state: State, field: FieldDefinition, frames: readonly Frame[]): Result {
  const kind = container(frames, 'group');
  if (kind === 'missing') return result();
  if (kind === 'null') return nullContainer(frames);
  const nested = fields(
    state,
    field.fields ?? [],
    frames.map((frame) => ({
      locale: frame.locale,
      current: objectValue(frame.current) ? frame.current : {},
      defaulted: frame.defaulted,
      ...(objectValue(frame.patch) ? { patch: frame.patch } : {}),
    })),
  );
  const output = result();
  const changed = frames.some((frame) => frame.explicit && !objectValue(frame.current));
  for (const frame of frames) {
    output.data.set(frame.locale, nested.data[frame.locale] ?? {});
    const patch = nested.patches[frame.locale] ?? {};
    if (frame.explicit || changed || Object.keys(patch).length > 0)
      output.patches.set(frame.locale, patch);
  }
  return output;
}
function items(value: JsonValue | undefined): DocumentData[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => !objectValue(item))) fail('invalid_input');
  return value.filter(objectValue);
}
function itemId(value: JsonValue | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !z.uuid().safeParse(value).success) fail('invalid_input');
  return value.toLowerCase();
}
function rowMetadata(
  field: FieldDefinition,
  sources: readonly DocumentData[],
  current: readonly DocumentData[],
): DocumentData {
  const ids = sources
    .map((source) => itemId(source['id']))
    .filter((value): value is string => value !== undefined);
  const id = consistent(ids) ?? randomUUID();
  if (field.type !== 'blocks') {
    if (sources.some((source) => Object.hasOwn(source, 'blockType'))) fail('invalid_input');
    return { id };
  }
  const explicitTypes = sources
    .map((source) => source['blockType'])
    .filter((value): value is JsonValue => value !== undefined);
  const type = consistent(
    explicitTypes.length > 0
      ? explicitTypes
      : current.filter((row) => itemId(row['id']) === id).map((row) => row['blockType'] ?? null),
  );
  if (typeof type !== 'string' || !field.blocks?.some((block) => block.key === type))
    fail('invalid_input');
  return { id, blockType: type };
}
function metadata(state: State, field: FieldDefinition, frames: readonly Frame[]): DocumentData[] {
  const supplied = frames.filter((frame) => frame.explicit);
  const sources =
    supplied.length > 0
      ? supplied.map((frame) => items(frame.patch))
      : frames
          .filter((frame) => frame.current !== undefined && frame.current !== null)
          .map((frame) => items(frame.current));
  const length = sources[0]?.length ?? 0;
  if (length > state.limits.maxArrayItems || sources.some((rows) => rows.length !== length))
    fail('invalid_input');
  const current = frames.flatMap((frame) => items(frame.current));
  return Array.from({ length }, (_unused, position) =>
    rowMetadata(
      field,
      sources.map((rows) => rows[position] ?? {}),
      current,
    ),
  );
}
function rowFields(field: FieldDefinition, row: DocumentData): readonly FieldDefinition[] {
  if (field.type !== 'blocks') return field.fields ?? [];
  return field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [];
}
function rowBody(row: DocumentData | undefined, type: JsonValue | undefined): DocumentData {
  if (!row || (type !== undefined && row['blockType'] !== type)) return {};
  const { id: _id, blockType: _blockType, ...body } = row;
  return body;
}
function arrayRow(
  state: State,
  field: FieldDefinition,
  input: { frames: readonly Frame[]; row: DocumentData; position: number },
): ObjectResult {
  return fields(
    state,
    rowFields(field, input.row),
    input.frames.map((frame) => {
      const old = items(frame.current);
      const positional = old[input.position];
      const current =
        old.find((item) => itemId(item['id']) === input.row['id']) ??
        (positional && positional['id'] === undefined ? positional : undefined);
      const patch = frame.explicit ? items(frame.patch)[input.position] : undefined;
      return {
        locale: frame.locale,
        current: rowBody(current, input.row['blockType']),
        defaulted: frame.defaulted,
        ...(patch ? { patch: rowBody({ ...patch, ...input.row }, input.row['blockType']) } : {}),
      };
    }),
  );
}
function structuralChanged(
  current: JsonValue | undefined,
  rows: readonly DocumentData[],
  field: FieldDefinition,
): boolean {
  if (!Array.isArray(current)) return true;
  const before = items(current).map((row) => ({
    id: itemId(row['id']) ?? null,
    ...(field.type === 'blocks' ? { blockType: row['blockType'] ?? null } : {}),
  }));
  return canonical(before) !== canonical([...rows]);
}
function array(state: State, field: FieldDefinition, frames: readonly Frame[]): Result {
  const kind = container(frames, 'array');
  if (kind === 'missing') return result();
  if (kind === 'null') return nullContainer(frames);
  const rows = metadata(state, field, frames);
  const values = new Map(frames.map((frame) => [frame.locale, [] as JsonValue[]]));
  const patches = new Map(frames.map((frame) => [frame.locale, [] as JsonValue[]]));
  const changed =
    candidates(frames).explicit &&
    frames.some((frame) => structuralChanged(frame.current, rows, field));
  const childChanges = new Set<string>();
  rows.forEach((row, position) => {
    const nested = arrayRow(state, field, { frames, row, position });
    for (const frame of frames) {
      values.get(frame.locale)?.push({ ...row, ...nested.data[frame.locale] });
      const patch = nested.patches[frame.locale] ?? {};
      if (Object.keys(patch).length > 0) childChanges.add(frame.locale);
      patches.get(frame.locale)?.push({ ...row, ...patch });
    }
  });
  const output = result();
  for (const frame of frames) {
    output.data.set(frame.locale, values.get(frame.locale) ?? []);
    if (frame.explicit || changed || childChanges.has(frame.locale))
      output.patches.set(frame.locale, patches.get(frame.locale) ?? []);
  }
  return output;
}
function withDefaults(
  state: State,
  field: FieldDefinition,
  frames: readonly Frame[],
): readonly Frame[] {
  if (
    !state.applyDefaults ||
    field.defaultValue === undefined ||
    candidates(frames).values.length > 0
  )
    return frames;
  return frames.map((frame) => ({
    ...frame,
    current: structuredClone(field.defaultValue ?? null),
    defaulted: true,
  }));
}
function shared(state: State, field: FieldDefinition, frames: readonly Frame[]): Result {
  const inputs = withDefaults(state, field, frames);
  if (field.type === 'group') return group(state, field, inputs);
  if (field.type === 'array' || field.type === 'blocks') return array(state, field, inputs);
  return scalar(state, field, inputs);
}
function resolve(state: State, field: FieldDefinition, frames: readonly Frame[]): Result {
  if (!field.localized) return shared(state, field, frames);
  const output = result();
  for (const frame of frames) {
    const local = shared(
      {
        ...state,
        applyDefaults: state.applyDefaults === true && state.requested.has(frame.locale),
      },
      field,
      [frame],
    );
    for (const [locale, value] of local.data) output.data.set(locale, value);
    for (const [locale, value] of local.patches) output.patches.set(locale, value);
  }
  return output;
}
function assertMap(
  value: unknown,
  input: NormalizeInput,
): asserts value is Readonly<Record<string, DocumentData>> {
  if (!objectValue(value)) fail('invalid_input');
  assertJsonBudget(value, {
    maxDepth: input.limits.maxFieldDepth * 2 + input.limits.maxRichTextDepth * 2 + 2,
    maxBytes: input.limits.maxStorageBytes,
    maxNodes: input.limits.maxStorageBytes,
  });
  for (const [locale, data] of Object.entries(value))
    if (!input.collection.locales.supported.includes(locale) || !objectValue(data))
      fail('invalid_input');
}
export function normalizeLocaleData(input: NormalizeInput): {
  dataByLocale: Record<string, DocumentData>;
  patches: Record<string, DocumentData>;
} {
  assertMap(input.patches, input);
  if (input.current !== undefined) assertMap(input.current, input);
  if (Object.keys(input.patches).length === 0 && Object.keys(input.current ?? {}).length === 0)
    fail('invalid_input');
  const state: State = { ...input, requested: new Set(Object.keys(input.patches)) };
  const output = fields(
    state,
    input.collection.fields,
    input.collection.locales.supported.map((locale) => ({
      locale,
      current:
        input.current && Object.hasOwn(input.current, locale) ? (input.current[locale] ?? {}) : {},
      ...(Object.hasOwn(input.patches, locale) ? { patch: input.patches[locale] ?? {} } : {}),
    })),
  );
  const dataByLocale = Object.fromEntries(
    Object.entries(output.data).map(([locale, data]) => [
      locale,
      validateData({
        collection: input.collection,
        data,
        locale,
        mode: 'draft',
        limits: input.limits,
      }),
    ]),
  );
  const patches = Object.fromEntries(
    Object.entries(output.patches).filter(
      ([locale, data]) => state.requested.has(locale) || Object.keys(data).length > 0,
    ),
  );
  return { dataByLocale, patches };
}
