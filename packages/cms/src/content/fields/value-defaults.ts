import { fail } from '@new-cms/cms/platform/contracts';
import { dataFields } from './structure.ts';
import { isJsonValue, objectValue, ownValue } from './json-value.ts';
import { immutable, invokeFunction } from './invoke-function.ts';
import { assertJsonBudget } from './data-budget.ts';
import type { FunctionScope } from './invoke-function.ts';
import type {
  ContentLimits,
  DocumentData,
  FieldDefinition,
  FieldValueContext,
  JsonValue,
  MaybePromise,
  VersionedFunction,
} from '../definition.ts';

type DynamicDefault = VersionedFunction<
  (context: FieldValueContext) => MaybePromise<JsonValue | undefined>
>;
export function dynamicDefault(value: FieldDefinition['defaultValue']): value is DynamicDefault {
  return (
    value !== null && typeof value === 'object' && 'run' in value && typeof value.run === 'function'
  );
}

interface Input {
  fields: readonly FieldDefinition[];
  data: DocumentData;
  current?: DocumentData;
  locale: string;
  limits: ContentLimits;
  scope: FunctionScope;
  shared?: Map<string, JsonValue | undefined>;
  localized?: boolean;
  root?: DocumentData;
  path?: string;
}

async function defaultValue(
  field: FieldDefinition,
  input: Input & { path: string },
): Promise<JsonValue | undefined> {
  const configured = field.defaultValue;
  if (!dynamicDefault(configured)) return structuredClone(configured);
  const shared = !input.localized && !field.localized && input.shared;
  if (shared && shared.has(input.path)) return structuredClone(shared.get(input.path));
  const context = immutable({
    data: input.root ?? input.data,
    locale: input.locale,
    mode: 'draft' as const,
    ...(input.scope.actor ? { actor: input.scope.actor } : {}),
    ...(input.scope.operation ? { operation: input.scope.operation } : {}),
  });
  const result = await invokeFunction({
    scope: input.scope,
    limits: input.limits,
    run: (signal) => configured.run(Object.freeze({ ...context, signal })),
  });
  if (result !== undefined) {
    assertJsonBudget(result, {
      maxDepth: input.limits.maxFieldDepth * 2 + input.limits.maxRichTextDepth * 2 + 1,
      maxBytes: input.limits.maxDataBytes,
      maxNodes: input.limits.maxDataBytes,
    });
    if (!isJsonValue(result)) fail('invalid_input');
  }
  if (shared) shared.set(input.path, result);
  return structuredClone(result);
}

async function children(
  field: FieldDefinition,
  input: Input & { value: JsonValue; path: string },
): Promise<JsonValue> {
  const nested = { ...input, localized: input.localized === true || field.localized === true };
  if (field.type === 'group' && objectValue(input.value)) {
    const current = input.current ? ownValue(input.current, String(field.name)) : undefined;
    return fillDefaults({
      ...nested,
      fields: field.fields ?? [],
      data: input.value,
      current: objectValue(current) ? current : {},
    });
  }
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(input.value)) return input.value;
  return defaultRows(field, { ...nested, value: input.value });
}

async function defaultRows(
  field: FieldDefinition,
  input: Input & { value: JsonValue[]; path: string },
): Promise<JsonValue[]> {
  const rows: JsonValue[] = [];
  for (const [index, row] of input.value.entries()) {
    if (!objectValue(row)) {
      rows.push(row);
      continue;
    }
    const fields =
      field.type === 'blocks'
        ? (field.blocks?.find((block) => block.key === row['blockType'])?.fields ?? [])
        : (field.fields ?? []);
    rows.push(
      await fillDefaults({
        ...input,
        fields,
        data: row,
        current: {},
        path: `${input.path}.${typeof row['id'] === 'string' ? row['id'] : index}`,
      }),
    );
  }
  return rows;
}

export async function fillDefaults(input: Input): Promise<DocumentData> {
  const data = structuredClone(input.data);
  const context = { ...input, root: input.root ?? data };
  for (const field of dataFields(input.fields)) {
    if (field.virtual || field.type === 'join') continue;
    const name = String(field.name);
    const path = input.path ? `${input.path}.${name}` : name;
    let value = ownValue(data, name);
    if (value === undefined && (!input.current || ownValue(input.current, name) === undefined))
      value = await defaultValue(field, { ...context, path });
    if (value !== undefined) data[name] = await children(field, { ...context, value, path });
  }
  return data;
}
