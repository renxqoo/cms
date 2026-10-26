import { expect, it } from 'vitest';
import { validParameterReference, validProvenance } from '../parameter-validation.ts';
const input = {
  fields: [
    { name: 'prompt', label: 'Prompt', type: 'textarea', required: true },
    { name: 'steps', label: 'Steps', type: 'number', min: 0, max: 10, step: 2, defaultValue: 4 },
  ],
  scenarios: [{ key: 'basic', title: 'Basic', values: { prompt: 'A scene', steps: 6 } }],
  defaultScenarioKey: 'basic',
};
it('checks reference defaults and presets against independently declared field constraints', () => {
  expect(validParameterReference(input)).toBe(true);
  expect(
    validParameterReference({ ...input, scenarios: [{ key: 'basic', values: { steps: 5 } }] }),
  ).toBe(false);
  expect(validParameterReference({ ...input, defaultScenarioKey: 'missing' })).toBe(false);
  expect(
    validParameterReference({ ...input, fields: [...input.fields, input.fields[0] ?? null] }),
  ).toBe(false);
});
it('does not accept unavailable or credential-bearing URLs in local reference presets', () => {
  const fields = [{ name: 'url', type: 'url' }];
  for (const url of [
    'https://127.0.0.1/x',
    'https://user:pass@example.com/x',
    'javascript:alert(1)',
    'http://example.com',
  ])
    expect(validParameterReference({ fields, scenarios: [{ key: 'x', values: { url } }] })).toBe(
      false,
    );
  expect(
    validParameterReference({
      fields,
      scenarios: [{ key: 'x', values: { url: 'https://example.com/image.png' } }],
    }),
  ).toBe(true);
});
it('retains source distinction and dates while rejecting extra provenance fields', () => {
  expect(
    validProvenance({
      kind: 'model-output',
      sourceLabel: 'Captured run',
      createdAt: '2026-10-27T01:00:00Z',
    }),
  ).toBe(true);
  expect(
    validProvenance({ kind: 'illustration', sourceLabel: 'Studio', apiKey: 'not-a-secret' }),
  ).toBe(false);
});
it.each([
  { field: { name: 'x', type: 'array' }, valid: [], invalid: {} },
  { field: { name: 'x', type: 'object' }, valid: { nested: true }, invalid: [] },
  { field: { name: 'x', type: 'boolean' }, valid: false, invalid: 'false' },
  { field: { name: 'x', type: 'number', min: 0, max: 10 }, valid: 0, invalid: -1 },
  { field: { name: 'x', type: 'number', min: 0, max: 10 }, valid: 10, invalid: 11 },
  { field: { name: 'x', type: 'text', required: true }, valid: 'text', invalid: ' ' },
  {
    field: { name: 'x', type: 'select', options: [{ label: 'First', value: 'one' }] },
    valid: 'one',
    invalid: 'two',
  },
])(
  'validates $field.type without silently coercing preset values',
  ({ field: definition, valid, invalid }) => {
    expect(
      validParameterReference({
        fields: [definition],
        scenarios: [{ key: 'x', values: { x: valid } }],
      }),
    ).toBe(true);
    expect(
      validParameterReference({
        fields: [definition],
        scenarios: [{ key: 'x', values: { x: invalid } }],
      }),
    ).toBe(false);
  },
);
it('rejects contradictory bounds, duplicated options and undeclared or missing required preset inputs', () => {
  expect(validParameterReference({ fields: [{ name: 'x', type: 'number', min: 2, max: 1 }] })).toBe(
    false,
  );
  expect(validParameterReference({ fields: [{ name: 'x', type: 'select' }] })).toBe(false);
  expect(
    validParameterReference({
      fields: [
        {
          name: 'x',
          type: 'select',
          options: [
            { label: 'A', value: 'a' },
            { label: 'Again', value: 'a' },
          ],
        },
      ],
    }),
  ).toBe(false);
  expect(
    validParameterReference({
      fields: [{ name: 'x', type: 'number', defaultValue: 'not a number' }],
    }),
  ).toBe(false);
  expect(
    validParameterReference({
      fields: [],
      scenarios: [{ key: 'x', values: { unknown: 'value' } }],
    }),
  ).toBe(false);
  expect(
    validParameterReference({
      fields: [{ name: 'x', type: 'text', required: true }],
      scenarios: [{ key: 'x', values: {} }],
    }),
  ).toBe(false);
  expect(
    validParameterReference({
      fields: [{ name: 'x', type: 'text' }],
      scenarios: [{ key: 'x', values: {} }],
    }),
  ).toBe(true);
  expect(
    validParameterReference({
      fields: [],
      scenarios: [
        { key: 'x', values: {} },
        { key: 'x', values: {} },
      ],
    }),
  ).toBe(false);
  expect(validParameterReference({ fields: [], scenarios: [], defaultScenarioKey: null })).toBe(
    true,
  );
  expect(validParameterReference({ unknown: [] })).toBe(false);
});
it('rejects malformed or local URL presets and invalid evidence sources', () => {
  for (const value of [
    'not a url',
    'https://[::1]/x',
    'https://example.local/x',
    'https://localhost/x',
    'https://example.localhost/x',
  ])
    expect(
      validParameterReference({
        fields: [{ name: 'x', type: 'url' }],
        scenarios: [{ key: 'x', values: { x: value } }],
      }),
    ).toBe(false);
  expect(
    validProvenance({
      kind: 'illustration',
      sourceLabel: 'Source',
      sourceUrl: 'https://example.com/x',
    }),
  ).toBe(true);
  expect(
    validProvenance({
      kind: 'illustration',
      sourceLabel: 'Source',
      sourceUrl: 'https://user:password@example.com/x',
    }),
  ).toBe(false);
});
