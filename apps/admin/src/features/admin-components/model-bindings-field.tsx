'use client';

import type { FieldComponentProps } from './types';
import { isFieldData } from '../fields/data';
import type { FieldData, JsonValue } from '../fields/types';

function derived(row: FieldData, contracts: FieldData[]): FieldData {
  const allowed = contracts
    .filter((item) => item['profileKey'] === row['profileKey'])
    .map((item) => item['flowKey']);
  const flows = Array.isArray(row['enabledFlowKeys'])
    ? row['enabledFlowKeys'].filter((flow) => allowed.includes(flow))
    : [];
  const matching = contracts.filter(
    (item) => item['profileKey'] === row['profileKey'] && flows.includes(item['flowKey'] ?? null),
  );
  const result: FieldData = {
    ...row,
    enabledFlowKeys: flows,
    recipeKeys: row['recipeKeys'] ?? ['core.http'],
  };
  for (const name of ['inputModalities', 'outputModalities', 'capabilities']) {
    result[name] = [
      ...new Set(matching.flatMap((item) => (Array.isArray(item[name]) ? item[name] : []))),
    ];
  }
  const scenarios = Array.isArray(row['scenarios']) ? row['scenarios'].filter(isFieldData) : [];
  if (Array.isArray(row['scenarios']))
    result['scenarios'] = row['scenarios'].map((scenario) =>
      isFieldData(scenario) &&
      typeof scenario['flowKey'] === 'string' &&
      !flows.includes(scenario['flowKey'])
        ? { ...scenario, flowKey: null }
        : scenario,
    );
  if (
    row['defaultScenarioKey'] == null &&
    scenarios.length === 1 &&
    typeof scenarios[0]?.['key'] === 'string'
  )
    result['defaultScenarioKey'] = scenarios[0]['key'];
  return result;
}

export function ModelBindingsField(props: FieldComponentProps) {
  const source = props.customProps?.['derivations'];
  const contracts = Array.isArray(source) ? source.filter(isFieldData) : [];
  function change(data: FieldData) {
    if (props.readOnly) return;
    const rows = data['apiBindings'];
    const value: JsonValue = Array.isArray(rows)
      ? rows.map((row) => (isFieldData(row) ? derived(row, contracts) : row))
      : [];
    props.onChange(value);
  }
  return props.renderFields?.({
    readOnly: props.readOnly,
    idPrefix: props.id,
    layout: [{ ...props.node, components: { ...props.node.components, Field: undefined } }],
    value: { apiBindings: props.value ?? [] },
    onChange: change,
    onValidityChange: (key, error) => props.onValidityChange?.(key, error),
    resetKey: props.id,
  });
}
