import { fail } from '@new-cms/cms/platform/contracts';
import { immutable, invokeFunction } from '../fields/invoke-function.ts';
import { policyScope } from '../hooks/invoke.ts';
import type { ContentState } from '../types.ts';

export async function adminHidden(state: ContentState): Promise<boolean> {
  const configured = state.collection.admin?.hidden;
  if (typeof configured !== 'object') return configured === true;
  const context = immutable({
    actor: state.actor,
    operation: state.operationId,
    collectionKey: state.collection.key,
    locale: state.locale,
    mode: state.mode,
  });
  const hidden = await invokeFunction({
    limits: policyScope(state).limits,
    scope: policyScope(state).functions,
    run: (signal) => configured.run(Object.freeze({ ...context, signal })),
  });
  if (typeof hidden !== 'boolean') fail('invalid_input');
  return hidden;
}

export async function requireAdminVisible(state: ContentState): Promise<void> {
  if (await adminHidden(state)) fail('not_found');
}
