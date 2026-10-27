import { fail } from '@new-cms/cms/platform/contracts';
import { hookContext, invoke, functionScope } from '../hooks/invoke.ts';
import { validateData } from '../fields/validate-data.ts';
import { assertWritableData } from '../fields/policy-write.ts';
import { policyScope } from '../hooks/invoke.ts';
import { policyContext } from '../runtime.ts';
import { mergeCandidateValues } from '../editor/candidate-values.ts';
import { snapshotPatch } from '../documents/snapshot-patch.ts';
import { assertFieldOptions } from '../fields/filter-options.ts';
import { presetInitialData } from './preset-initial-data.ts';
import { presetConstraintChoices } from './preset-choices.ts';
import { presetActions } from './preset-access-contracts.ts';
import type {
  PresetAccess,
  PresetAction,
  PresetAccessRule,
  PresetSnapshot,
  PresetConstraintContext,
} from './preset-access-contracts.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

export function privatePresetAccess(actorId: string): PresetAccess {
  return {
    read: { constraint: 'onlyMe', users: [actorId] },
    update: { constraint: 'onlyMe', users: [actorId] },
    delete: { constraint: 'onlyMe', users: [actorId] },
  };
}

export function sharedPresetAccess(access: PresetAccess, actorId: string): boolean {
  return presetActions.some((action) => {
    const rule = access[action];
    return rule.constraint !== 'onlyMe' || rule.users?.length !== 1 || rule.users[0] !== actorId;
  });
}

export async function presetAllowed(
  state: ContentState,
  runtime: ContentRuntime,
  input: { preset: PresetSnapshot; action: PresetAction },
): Promise<boolean> {
  const { preset, action } = input;
  const rule = preset.access[action];
  if (rule.constraint === 'everyone') return true;
  if (rule.constraint === 'onlyMe' || rule.constraint === 'specificUsers')
    return rule.users?.includes(state.actor.id) === true;
  const registered = state.collection.queryPresetConstraints?.[action]?.find(
    (entry) => entry.value === rule.constraint,
  );
  if (!registered) return false;
  const context: PresetConstraintContext = {
    ...hookContext(state),
    action,
    preset,
    data: rule.data ?? {},
  };
  const result = await invoke(state, { hook: registered.access, context, limits: runtime.limits });
  if (typeof result !== 'boolean') fail('invalid_input');
  return result;
}

function builtinRule(
  state: ContentState,
  runtime: ContentRuntime,
  rule: PresetAccessRule,
): PresetAccessRule | undefined {
  if (rule.constraint === 'everyone') {
    if (rule.users?.length || Object.keys(rule.data ?? {}).length > 0 || rule.initialSnapshot)
      fail('invalid_input');
    return { constraint: 'everyone' };
  }
  if (rule.constraint === 'onlyMe' || rule.constraint === 'specificUsers') {
    if (Object.keys(rule.data ?? {}).length > 0 || rule.initialSnapshot) fail('invalid_input');
    const users =
      rule.constraint === 'onlyMe'
        ? [state.actor.id]
        : [...new Set([...(rule.users ?? []), state.actor.id])];
    if (users.length > runtime.limits.maxArrayItems) fail('capacity_exceeded');
    return { constraint: rule.constraint, users };
  }
  return undefined;
}

interface RuleInput {
  action: PresetAction;
  rule: PresetAccessRule;
  previous?: PresetAccessRule | undefined;
  presetId?: string | undefined;
}
async function normalizeRule(
  state: ContentState,
  runtime: ContentRuntime,
  input: RuleInput,
): Promise<PresetAccessRule> {
  const { action, rule, previous, presetId } = input;
  const builtin = builtinRule(state, runtime, rule);
  if (builtin) return builtin;
  const registered = state.collection.queryPresetConstraints?.[action]?.find(
    (entry) => entry.value === rule.constraint,
  );
  if (!registered || rule.users?.length) fail('invalid_input');
  const collection = { ...state.collection, fields: registered.fields ?? [] };
  const signed = rule.initialSnapshot
    ? presetInitialData(state, runtime, {
        action,
        constraint: rule.constraint,
        token: rule.initialSnapshot,
        id: presetId,
      })
    : {};
  const old = previous?.constraint === rule.constraint ? (previous.data ?? {}) : signed;
  const supplied = rule.data ?? {};
  const merged = mergeCandidateValues({ fields: collection.fields, previous: old, supplied });
  await assertWritableData({
    ...policyScope(state),
    collection,
    data: snapshotPatch({ fields: collection.fields, previous: old, next: merged }),
    previous: old,
    next: merged,
    context: policyContext(state, merged),
  });
  const data = await validateData({
    collection,
    data: merged,
    mode: 'publish',
    locale: state.locale,
    limits: runtime.limits,
    functions: functionScope(state),
    applyDefaults: true,
    requireComplete: true,
  });
  await assertFieldOptions({ ...state, collection }, { runtime, data });
  return { constraint: rule.constraint, data };
}

export async function normalizePresetAccess(
  state: ContentState,
  runtime: ContentRuntime,
  input: { preset: PresetSnapshot; previous?: PresetAccess | undefined },
): Promise<PresetAccess> {
  const { preset, previous } = input;
  const access = { ...preset.access };
  for (const action of presetActions)
    access[action] = await normalizeRule(state, runtime, {
      action,
      rule: access[action],
      previous: previous?.[action],
      presetId: previous ? preset.id : undefined,
    });
  const candidate = { ...preset, access };
  for (const action of presetActions)
    if (
      !(await presetConstraintChoices(state, action, candidate)).some(
        (option) => option.value === access[action].constraint,
      )
    )
      fail('forbidden');
  await preventPresetLockout(state, runtime, candidate);
  return access;
}

export async function preventPresetLockout(
  state: ContentState,
  runtime: ContentRuntime,
  preset: PresetSnapshot,
): Promise<void> {
  if (
    !(await presetAllowed(state, runtime, { preset, action: 'read' })) ||
    !(await presetAllowed(state, runtime, { preset, action: 'update' }))
  )
    fail('forbidden');
}
