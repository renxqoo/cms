import { fail } from '@new-cms/cms/platform/contracts';
import { immutable, invokeFunction } from '../fields/invoke-function.ts';
export { immutable } from '../fields/invoke-function.ts';
import type { ContentHookContext, ContentLimits, VersionedFunction } from '../definition.ts';
import type { ContentState } from '../types.ts';
import type { FunctionScope } from '../fields/invoke-function.ts';

export type HookState = Pick<
  ContentState,
  'ctx' | 'actor' | 'collection' | 'operationId' | 'locale' | 'mode' | 'hookBudget'
>;

export function functionScope(state: HookState): FunctionScope {
  state.hookBudget ??= { used: 0 };
  return {
    budget: state.hookBudget,
    actor: state.actor,
    operation: state.operationId,
    ...(state.ctx.signal ? { signal: state.ctx.signal } : {}),
  };
}

export function hookContext(
  state: HookState,
  context: Partial<ContentHookContext> = {},
): ContentHookContext {
  const { signal } = state.ctx;
  const cloned = immutable({
    actor: state.actor,
    operation: state.operationId,
    collectionKey: state.collection.key,
    locale: state.locale,
    mode: state.mode,
    ...context,
  });
  return Object.freeze({ ...cloned, ...(signal ? { signal } : {}) });
}

export async function invoke<T extends ContentHookContext>(
  state: HookState,
  input: { hook: VersionedFunction<(context: T) => unknown>; context: T; limits: ContentLimits },
): Promise<unknown> {
  state.hookBudget ??= { used: 0 };
  return invokeFunction({
    limits: input.limits,
    scope: functionScope(state),
    run: (signal) => input.hook.run(Object.freeze({ ...input.context, signal })),
  });
}

export function policyScope(state: HookState & { hookLimits?: ContentLimits }) {
  if (!state.hookLimits) fail('invalid_input');
  return { limits: state.hookLimits, functions: functionScope(state) };
}
