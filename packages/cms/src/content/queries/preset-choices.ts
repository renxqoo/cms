import { z } from 'zod';
import { presetActions } from './preset-access-contracts.ts';
import { filteredChoices } from '../fields/filtered-choices.ts';
import { functionScope, policyScope } from '../hooks/invoke.ts';
import { resolveLabel } from '../collections/labels.ts';
import type { PresetAction, PresetSnapshot } from './preset-access-contracts.ts';
import type { ContentState } from '../types.ts';
import type { FieldOption } from '../definition.ts';

export async function presetConstraintChoices(
  state: ContentState,
  action: PresetAction,
  preset?: PresetSnapshot,
) {
  const options: FieldOption[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'onlyMe', label: 'Only me' },
    { value: 'specificUsers', label: 'Specific users' },
    ...(state.collection.queryPresetConstraints?.[action] ?? []).map(({ value, label }) => ({
      value,
      label,
    })),
  ];
  const data = choiceData(state, preset);
  const filtered = await filteredChoices({
    field: {
      id: 'preset_constraint',
      name: 'constraint',
      type: 'select',
      options,
      ...(state.collection.filterQueryPresetConstraints
        ? { filterOptions: state.collection.filterQueryPresetConstraints }
        : {}),
    },
    path: `access.${action}.constraint`,
    data,
    locale: state.locale,
    collection: state.collection.key,
    mode: state.mode,
    limits: policyScope(state).limits,
    functions: functionScope(state),
  });
  return (filtered ?? options).map((option) =>
    typeof option === 'string'
      ? { value: option, label: option }
      : { value: option.value, label: resolveLabel(option.label, state.locale, option.value) },
  );
}

function choiceData(state: ContentState, preset?: PresetSnapshot) {
  const data = z.record(z.string(), z.json()).parse(
    preset ?? {
      ownerId: state.actor.id,
      name: '',
      query: { q: '', sort: [], columns: [] },
      access: Object.fromEntries(
        presetActions.map((operation) => [
          operation,
          { constraint: 'onlyMe', users: [state.actor.id] },
        ]),
      ),
    },
  );
  return data;
}
