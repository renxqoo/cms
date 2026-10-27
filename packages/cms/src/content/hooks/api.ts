import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import { assertJsonBudget } from '../fields/data-budget.ts';
import { objectValue } from '../fields/json-value.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { hookContext, immutable, invoke } from './invoke.ts';
import { walkFields } from './fields.ts';
import type { HookState } from './invoke.ts';
import type { ContentHookContext, ContentLimits, DocumentData, Where } from '../definition.ts';

type DataStage = 'beforeValidate' | 'beforeChange' | 'afterRead';
type ObserverStage =
  | 'beforeOperation'
  | 'afterOperation'
  | 'afterChange'
  | 'beforePublish'
  | 'beforeDelete'
  | 'afterDelete'
  | 'afterError';

export async function observeHooks(
  state: HookState,
  input: { stage: ObserverStage; limits: ContentLimits; context?: Partial<ContentHookContext> },
): Promise<void> {
  const context = hookContext(state, input.context);
  for (const hook of state.collection.hooks?.[input.stage] ?? [])
    if ((await invoke(state, { hook, context, limits: input.limits })) !== undefined)
      fail('invalid_input');
  if (input.stage === 'afterChange' && context.data)
    await walkFields(state, context.data, {
      ...input,
      stage: 'afterChange',
      fields: state.collection.fields,
    });
}

function checkedData(value: unknown, limits: ContentLimits): DocumentData {
  assertJsonBudget(value, {
    maxDepth: Math.max(limits.maxFieldDepth, limits.maxRichTextDepth) * 2 + 2,
    maxNodes: limits.maxDataBytes,
    maxBytes: limits.maxDataBytes,
  });
  if (!objectValue(value)) fail('invalid_input');
  return structuredClone(value);
}

export async function transformHooks(
  state: HookState,
  input: {
    stage: DataStage;
    data: DocumentData;
    limits: ContentLimits;
    context?: Partial<ContentHookContext>;
  },
): Promise<DocumentData> {
  let data = structuredClone(input.data);
  for (const hook of state.collection.hooks?.[input.stage] ?? []) {
    const context = Object.freeze({ ...hookContext(state, input.context), data: immutable(data) });
    const result = await invoke(state, { hook, context, limits: input.limits });
    if (result !== undefined) data = checkedData(result, input.limits);
  }
  return walkFields(state, data, { ...input, fields: state.collection.fields });
}

export async function readHooks(
  state: HookState,
  limits: ContentLimits,
): Promise<Where | undefined> {
  const predicates: Where[] = [];
  for (const hook of state.collection.hooks?.beforeRead ?? []) {
    const result = await invoke(state, { hook, context: hookContext(state), limits });
    if (result === undefined) continue;
    const { where } = parseQuery({
      collection: state.collection,
      limits,
      input: { where: result },
    });
    if (where) predicates.push(where);
  }
  return predicates.length > 0 ? { and: predicates } : undefined;
}

export async function runOperationHooks<T>(
  state: HookState,
  input: { limits: ContentLimits; work(): Promise<T> },
): Promise<T> {
  try {
    await observeHooks(state, { stage: 'beforeOperation', limits: input.limits });
    const result = await input.work();
    await observeHooks(state, { stage: 'afterOperation', limits: input.limits });
    return result;
  } catch (error) {
    try {
      await observeHooks(state, {
        stage: 'afterError',
        limits: input.limits,
        context: { errorCode: error instanceof CmsError ? error.code : 'internal_error' },
      });
    } catch {
      throw error;
    }
    throw error;
  }
}
