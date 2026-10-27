import { functionScope } from './invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { assertJsonBudget } from '../fields/data-budget.ts';
import { isJsonValue, objectValue, ownValue } from '../fields/json-value.ts';
import { dataFields } from '../fields/structure.ts';
import { projectData } from '../fields/policy-read.ts';
import { hookContext, invoke } from './invoke.ts';
import { virtualPath } from './virtual.ts';
import type { HookState } from './invoke.ts';
import type {
  ContentHookContext,
  ContentLimits,
  DocumentData,
  FieldDefinition,
  JsonValue,
} from '../definition.ts';

type Stage = 'beforeValidate' | 'beforeChange' | 'afterRead' | 'afterChange';
interface Input {
  stage: Stage;
  limits: ContentLimits;
  context?: Partial<ContentHookContext>;
  rootData?: DocumentData;
}

function checked(value: unknown, limits: ContentLimits): JsonValue {
  assertJsonBudget(value, {
    maxDepth: Math.max(limits.maxFieldDepth, limits.maxRichTextDepth) * 2 + 2,
    maxNodes: limits.maxDataBytes,
    maxBytes: limits.maxDataBytes,
  });
  if (!isJsonValue(value)) fail('invalid_input');
  return structuredClone(value);
}

async function virtualValue(
  state: HookState,
  field: FieldDefinition,
  input: Input & { data: DocumentData; value: JsonValue | undefined; path: string },
): Promise<JsonValue | undefined> {
  if (input.stage !== 'afterRead') return input.value;
  const source = input.rootData ?? input.data;
  if (typeof field.virtual === 'string') {
    if (input.value !== undefined) return input.value;
    const visible = await projectData({
      limits: input.limits,
      functions: functionScope(state),
      collection: state.collection,
      data: source,
      context: {
        actor: state.actor,
        operation: state.operationId,
        collectionKey: state.collection.key,
        locale: state.locale,
        mode: state.mode,
      },
    });
    return virtualPath(visible, field.virtual.split('.'));
  }
  if (typeof field.virtual !== 'object') return input.value;
  const result = await invoke(state, {
    hook: field.virtual,
    limits: input.limits,
    context: hookContext(state, { ...input.context, data: source, path: input.path }),
  });
  return result === undefined ? input.value : checked(result, input.limits);
}

async function fieldValue(
  state: HookState,
  field: FieldDefinition,
  input: Input & { data: DocumentData; value: JsonValue | undefined; path: string },
): Promise<JsonValue | undefined> {
  let value = await virtualValue(state, field, input);
  for (const hook of field.hooks?.[input.stage] ?? []) {
    const result = await invoke(state, {
      hook,
      limits: input.limits,
      context: hookContext(state, {
        ...input.context,
        data: input.rootData ?? input.data,
        ...(value === undefined ? {} : { value }),
        path: input.path,
      }),
    });
    if (input.stage === 'afterChange') {
      if (result !== undefined) fail('invalid_input');
    } else if (result !== undefined) value = checked(result, input.limits);
  }
  return value;
}

async function children(
  state: HookState,
  value: JsonValue,
  input: Input & { field: FieldDefinition; path: string },
): Promise<JsonValue> {
  const { field } = input;
  if (field.type === 'group' && objectValue(value))
    return walkFields(state, value, { ...input, fields: field.fields ?? [] });
  if (!['array', 'blocks'].includes(field.type) || !Array.isArray(value)) return value;
  const result: JsonValue[] = [];
  for (const [index, item] of value.entries()) {
    if (!objectValue(item)) {
      result.push(item);
      continue;
    }
    const fields =
      field.type === 'blocks'
        ? (field.blocks?.find((block) => block.key === item['blockType'])?.fields ?? [])
        : (field.fields ?? []);
    const id = typeof item['id'] === 'string' ? item['id'] : String(index);
    result.push(await walkFields(state, item, { ...input, fields, path: `${input.path}.${id}` }));
  }
  return result;
}

export async function walkFields(
  state: HookState,
  data: DocumentData,
  input: Input & { fields: readonly FieldDefinition[]; path?: string },
): Promise<DocumentData> {
  const next = structuredClone(data);
  const context = { ...input, rootData: input.rootData ?? next };
  for (const field of dataFields(input.fields)) {
    const name = String(field.name);
    const path = input.path ? `${input.path}.${name}` : name;
    const value = await fieldValue(state, field, {
      ...context,
      data: next,
      value: ownValue(next, name),
      path,
    });
    if (value !== undefined) next[name] = await children(state, value, { ...context, field, path });
  }
  return next;
}
