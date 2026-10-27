import { ownValue } from './json-value.ts';
import { rethrowFieldError } from './validation-error.ts';
import { assertJsonBudget } from './data-budget.ts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail } from '@new-cms/cms/platform/contracts';
import type {
  CollectionDefinition,
  ContentLimits,
  DocumentData,
  FieldDefinition,
  JsonValue,
  RichTextNodeRegistration,
} from '../definition.ts';
import { dataFields } from './structure.ts';
import { objectValue } from './json-value.ts';
import { scalarValue } from './scalar.ts';
import { dynamicDefault } from './value-defaults.ts';

interface State {
  path: string;
  disabledRules: ReadonlySet<string>;
  mode: 'draft' | 'publish';
  locale: string;
  limits: ContentLimits;
  applyDefaults: boolean;
  root: DocumentData;
  registrations: readonly RichTextNodeRegistration[];
  allowVirtual: boolean;
}
function itemIdentity(value: DocumentData): string {
  const { id } = value;
  if (id === undefined) return randomUUID();
  if (typeof id !== 'string' || !z.uuid().safeParse(id).success) fail('invalid_input');
  return id.toLowerCase();
}
function arrayValue(value: JsonValue, field: FieldDefinition, state: State): JsonValue {
  if (
    !Array.isArray(value) ||
    value.length > state.limits.maxArrayItems ||
    (field.max !== undefined && value.length > field.max) ||
    (state.mode === 'publish' &&
      !state.disabledRules.has(state.path) &&
      field.min !== undefined &&
      value.length < field.min)
  )
    fail('invalid_input');
  const identities = new Set<string>();
  return value.map((item) => {
    if (!objectValue(item)) fail('invalid_input');
    const id = itemIdentity(item);
    if (identities.has(id)) fail('invalid_input');
    identities.add(id);
    const { id: _id, blockType, ...body } = item;
    if (field.type === 'array') {
      if (blockType !== undefined) fail('invalid_input');
      return {
        id,
        ...validateFields(field.fields ?? [], body, { ...state, path: `${state.path}.${id}` }),
      };
    }
    const block = field.blocks?.find((candidate) => candidate.key === blockType);
    if (!block || typeof blockType !== 'string') fail('invalid_input');
    return {
      id,
      blockType,
      ...validateFields(block.fields, body, { ...state, path: `${state.path}.${id}` }),
    };
  });
}
function presentValue(value: JsonValue, field: FieldDefinition, state: State): JsonValue {
  const required = field.required && !state.disabledRules.has(state.path);
  if (value === null) {
    if (required && state.mode === 'publish') fail('invalid_input');
    return null;
  }
  let result: JsonValue;
  if (field.type === 'group') {
    if (!objectValue(value)) fail('invalid_input');
    result = validateFields(field.fields ?? [], value, state);
  } else if (field.type === 'array' || field.type === 'blocks')
    result = arrayValue(value, field, state);
  else
    result = scalarValue({
      value,
      field,
      limits: state.limits,
      registrations: state.registrations,
    });
  if (required && emptyRequired(field, result, state.mode)) fail('invalid_input');
  return result;
}
function validateFields(
  fields: readonly FieldDefinition[],
  value: DocumentData,
  state: State,
): DocumentData {
  const definitions = dataFields(fields);
  const allowed = new Map(
    definitions
      .filter((field) => field.type !== 'join' && (state.allowVirtual || !field.virtual))
      .map((field) => [field.name, field]),
  );
  if (Object.keys(value).some((key) => !allowed.has(key))) fail('invalid_input');
  const result: DocumentData = {};
  for (const field of definitions) {
    if (field.type === 'join' || (field.virtual && !state.allowVirtual)) continue;
    const name = String(field.name);
    const path = state.path ? `${state.path}.${name}` : name;
    try {
      const data = fieldValue(field, value, { ...state, path });
      if (data !== undefined) result[name] = data;
    } catch (error) {
      rethrowFieldError(error, path);
    }
  }
  return result;
}
function fieldValue(
  field: FieldDefinition,
  value: DocumentData,
  state: State,
): JsonValue | undefined {
  let data = ownValue(value, String(field.name));
  if (
    data === undefined &&
    state.applyDefaults &&
    field.defaultValue !== undefined &&
    !dynamicDefault(field.defaultValue)
  )
    data = structuredClone(field.defaultValue);
  if (data === undefined) {
    if (field.required && state.mode === 'publish' && !state.disabledRules.has(state.path))
      fail('invalid_input');
    return undefined;
  }
  return presentValue(data, field, state);
}

export function validateDataShape(input: {
  collection: CollectionDefinition;
  data: unknown;
  mode: 'draft' | 'publish';
  locale: string;
  limits: ContentLimits;
  applyDefaults?: boolean;
  allowVirtual?: boolean;
  disabledRules?: ReadonlySet<string>;
}): DocumentData {
  if (!objectValue(input.data) || !input.collection.locales.supported.includes(input.locale))
    fail('invalid_input');
  assertJsonBudget(input.data, {
    maxDepth: input.limits.maxFieldDepth * 2 + input.limits.maxRichTextDepth * 2 + 1,
    maxBytes: input.limits.maxDataBytes,
    maxNodes: input.limits.maxDataBytes,
  });
  const bytes = Buffer.byteLength(JSON.stringify(input.data));
  if (bytes > input.limits.maxDataBytes) fail('payload_too_large');
  const result = validateFields(input.collection.fields, input.data, {
    path: '',
    disabledRules: input.disabledRules ?? new Set(),
    mode: input.mode,
    locale: input.locale,
    limits: input.limits,
    applyDefaults: input.applyDefaults === true,
    root: input.data,
    registrations: input.collection.richTextNodes ?? [],
    allowVirtual: input.allowVirtual === true,
  });
  if (Buffer.byteLength(JSON.stringify(result)) > input.limits.maxDataBytes)
    fail('payload_too_large');
  return result;
}

function emptyRequired(field: FieldDefinition, value: JsonValue, mode: State['mode']): boolean {
  if (!field.required || mode !== 'publish') return false;
  return value === '' || (Array.isArray(value) && value.length === 0);
}
