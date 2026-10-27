import { invoke, hookContext } from '../hooks/invoke.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { whereSchema } from './where-schema.ts';
import { assertRawQueryBudget } from './query-budget.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { QueryInput } from '../model.ts';
import type { ContentHookContext } from '../definition.ts';

export interface AdminListContext extends ContentHookContext {
  query: QueryInput;
}

export async function adminQuery(
  state: ContentState,
  runtime: ContentRuntime,
  query: QueryInput,
): Promise<QueryInput> {
  const callback = state.collection.admin?.baseFilter;
  if (query.context !== 'admin' || !callback) return query;
  const value = await invoke(state, {
    hook: callback,
    context: { ...hookContext(state), query },
    limits: runtime.limits,
  });
  if (value === null) return query;
  assertRawQueryBudget({ where: value }, runtime.limits);
  const result = whereSchema.safeParse(value);
  if (!result.success) fail('invalid_input');
  const policy = query.policy ? { and: [query.policy, result.data] } : result.data;
  return { ...query, policy };
}
