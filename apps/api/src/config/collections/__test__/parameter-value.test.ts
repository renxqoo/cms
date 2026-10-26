import { expect, it } from 'vitest';
import type { JsonValue } from '@new-cms/cms/content/generate';
import { validParameterReference } from '../parameter-validation.ts';
import { validParameterValue, validParameterValues } from '../parameter-value.ts';
function reference(value: JsonValue, type = 'textarea', name = 'prompt') {
  return {
    fields: [{ name, label: 'Input', type, required: true }],
    scenarios: [{ key: 'normal', title: 'Normal', values: { [name]: value } }],
    defaultScenarioKey: 'normal',
  };
}
it('rejects oversized, reserved or unnamed public parameter presets before they break a model detail', () => {
  for (const value of [
    reference('x'.repeat(12001)),
    reference(
      Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`key${i}`, true])),
      'object',
    ),
    reference('A prompt', 'textarea', 'constructor'),
    {
      ...reference('Hello'),
      scenarios: [{ key: '', title: 'Scenario', values: { prompt: 'Hello' } }],
      defaultScenarioKey: '',
    },
  ])
    expect(validParameterReference(value)).toBe(false);
  expect(validParameterReference(reference('😀'.repeat(12000)))).toBe(true);
});
it('applies the same Unicode, depth, total entry and reserved-key limits to defaults and showcase settings', () => {
  expect(validParameterValue('😀'.repeat(12000))).toBe(true);
  expect(validParameterValue('😀'.repeat(12001))).toBe(false);
  expect(validParameterValue({ nested: [null, false, 1, 'text'] })).toBe(true);
  expect(validParameterValue(null)).toBe(false);
  expect(validParameterValue(NaN)).toBe(false);
  expect(validParameterValue(new Date())).toBe(false);
  const sparse = Array<unknown>(2);
  sparse[1] = 'sparse';
  expect(validParameterValue(sparse)).toBe(false);
  expect(validParameterValue(JSON.parse('{"nested":{"constructor":1}}'))).toBe(false);
  const allowed = Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`key${i}`, true]));
  expect(validParameterValue(allowed)).toBe(true);
  expect(validParameterValue({ nested: allowed })).toBe(false);
  let deep: JsonValue = 1;
  for (let i = 0; i < 8; i++) deep = [deep];
  expect(validParameterValue(deep)).toBe(true);
  expect(validParameterValue([deep])).toBe(false);
  expect(validParameterValues({ prompt: 'Hello', settings: { nested: [1, null] } })).toBe(true);
  expect(validParameterValues({ prompt: 'x'.repeat(12001) })).toBe(false);
  expect(validParameterValues({ constructor: 'value' })).toBe(false);
  expect(validParameterValues([])).toBe(false);
  expect(validParameterValues(null)).toBe(false);
  expect(
    validParameterReference({
      fields: [
        { name: 'input', label: 'Input', type: 'object', defaultValue: { nested: allowed } },
      ],
    }),
  ).toBe(false);
});
