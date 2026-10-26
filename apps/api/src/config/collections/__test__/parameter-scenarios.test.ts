import type { JsonValue, DocumentData } from '@new-cms/cms/content/generate';
import { expect, it } from 'vitest';
import { parameterReference } from '../parameter-reference.ts';
import { validParameterReference } from '../parameter-validation.ts';
const fields = [
  { name: 'prompt', type: 'text', required: true },
  {
    name: 'quality',
    type: 'select',
    options: [
      { label: 'Standard', value: 'standard' },
      { label: 'High', value: 'high' },
    ],
    defaultValue: 'high',
  },
  { name: 'count', type: 'number', min: 1, max: 9, step: 2, defaultValue: 3 },
];
function reference(inputConstraints: JsonValue[], values: DocumentData = { prompt: 'A scene' }) {
  return {
    fields,
    scenarios: [{ key: 'compact', title: 'Compact', values, inputConstraints }],
    defaultScenarioKey: 'compact',
  };
}
it('allows a scenario to narrow choices and numeric bounds while keeping the original step anchor', () => {
  expect(
    validParameterReference(
      reference([
        { field: 'quality', allowedValues: ['standard'] },
        { field: 'count', min: 4, max: 7 },
      ]),
    ),
  ).toBe(true);
  expect(
    validParameterReference(
      reference([{ field: 'count', min: 4, max: 7 }], { prompt: 'A scene', count: 5 }),
    ),
  ).toBe(true);
  expect(
    validParameterReference(
      reference([{ field: 'count', min: 4, max: 7 }], { prompt: 'A scene', count: 4 }),
    ),
  ).toBe(false);
});
it.each(
  [
    [{ field: 'missing', required: true }],
    [
      { field: 'count', min: 2 },
      { field: 'count', max: 8 },
    ],
    [{ field: 'count', min: 7, max: 3 }],
    [{ field: 'count', allowedValues: ['3'] }],
    [{ field: 'quality', allowedValues: ['invented'] }],
    [{ field: 'quality', min: 1 }],
    [{ field: 'count', allowedValues: [3, 3] }],
    [{ field: 'count', unknown: 1 }],
    [{ field: 'count', min: 20 }],
  ].map((inputConstraints) => ({ inputConstraints })),
)('rejects malformed or contradictory scenario overrides', ({ inputConstraints }) => {
  expect(validParameterReference(reference(inputConstraints))).toBe(false);
});
it('applies scenario required overrides without making another scenario globally required', () => {
  const source = {
    fields: [{ name: 'prompt', type: 'text' }],
    scenarios: [
      { key: 'required', values: {}, inputConstraints: [{ field: 'prompt', required: true }] },
      { key: 'optional', values: {} },
    ],
  };
  expect(validParameterReference(source)).toBe(false);
  const first = source.scenarios.at(0);
  if (!first) throw new Error('Missing required scenario');
  first.values = { prompt: 'A scene' };
  expect(validParameterReference(source)).toBe(true);
});
it('a false required override and an empty legal choice set disable an input without retaining its default', () => {
  expect(
    validParameterReference(
      reference([{ field: 'prompt', required: false, allowedValues: [] }], {}),
    ),
  ).toBe(true);
  expect(
    validParameterReference(
      reference([{ field: 'prompt', required: false, allowedValues: [] }], {
        prompt: 'supplied',
      }),
    ),
  ).toBe(false);
  expect(
    validParameterReference(reference([{ field: 'prompt', required: true, allowedValues: [] }])),
  ).toBe(false);
});
it('a required numeric interval must contain at least one value on the configured step', () => {
  expect(
    validParameterReference(reference([{ field: 'count', required: true, min: 4, max: 4 }])),
  ).toBe(false);
  expect(
    validParameterReference(reference([{ field: 'count', required: true, min: 5, max: 5 }])),
  ).toBe(true);
});
it('explicit null cannot silently reuse a default and required structured presets cannot be empty', () => {
  expect(validParameterReference(reference([], { prompt: 'A scene', count: null }))).toBe(false);
  expect(
    validParameterReference({
      fields: [{ name: 'items', type: 'array', required: true }],
      scenarios: [{ key: 'empty', values: { items: [] } }],
    }),
  ).toBe(false);
});

it('scenario defaults repair only an explicit incompatible default while missing required values remain invalid', () => {
  expect(
    validParameterReference({
      fields: [
        {
          name: 'choice',
          type: 'select',
          required: true,
          defaultValue: 'high',
          options: [
            { label: 'High', value: 'high' },
            { label: 'Low', value: 'low' },
          ],
        },
      ],
      scenarios: [
        { key: 'low', values: {}, inputConstraints: [{ field: 'choice', allowedValues: ['low'] }] },
      ],
    }),
  ).toBe(true);
  expect(
    validParameterReference({
      fields: [{ name: 'count', type: 'number', required: true, min: 0, max: 5 }],
      scenarios: [{ key: 'x', values: {}, inputConstraints: [{ field: 'count', min: 2 }] }],
    }),
  ).toBe(false);
  expect(
    validParameterReference({
      fields: [{ name: 'on', type: 'boolean', defaultValue: false }],
      scenarios: [
        { key: 'x', values: {}, inputConstraints: [{ field: 'on', allowedValues: [true] }] },
      ],
    }),
  ).toBe(true);
});
it.each([
  {
    field: { name: 'x', type: 'select', options: [{ label: 'A', value: 'a' }] },
    inputConstraints: [{ field: 'x', allowedValues: [1] }],
  },
  {
    field: { name: 'x', type: 'boolean' },
    inputConstraints: [{ field: 'x', allowedValues: ['true'] }],
  },
  { field: { name: 'x', type: 'array' }, inputConstraints: [{ field: 'x', allowedValues: [1] }] },
  { field: { name: 'x', type: 'object' }, inputConstraints: [{ field: 'x', min: 1 }] },
  {
    field: { name: 'x', type: 'number', min: 1, max: 3 },
    inputConstraints: [{ field: 'x', max: 0 }],
  },
])(
  'choice types and range overrides cannot contradict their declared field',
  ({ field, inputConstraints }) => {
    expect(
      validParameterReference({
        fields: [field],
        scenarios: [{ key: 'x', values: {}, inputConstraints }],
      }),
    ).toBe(false);
  },
);
it('structured count constraints remain meaningful and never reinterpret a fractional or stepped count', () => {
  expect(
    validParameterReference({
      fields: [{ name: 'x', type: 'array', min: 1, max: 2 }],
      scenarios: [{ key: 'x', values: { x: [1, 2, 3] } }],
    }),
  ).toBe(false);
  expect(
    validParameterReference({
      fields: [{ name: 'x', type: 'object', min: 2 }],
      scenarios: [{ key: 'x', values: { x: { one: 1 } } }],
    }),
  ).toBe(false);
  expect(validParameterReference({ fields: [{ name: 'x', type: 'array', min: 0.5 }] })).toBe(false);
  expect(validParameterReference({ fields: [{ name: 'x', type: 'object', step: 1 }] })).toBe(false);
});
it.each(['https://example.internal/x', 'https://example.test/x', 'https://example.invalid/x'])(
  'reserved domain %s is not published as a public reference',
  (url) => {
    expect(
      validParameterReference({
        fields: [{ name: 'x', type: 'url' }],
        scenarios: [{ key: 'x', values: { x: url } }],
      }),
    ).toBe(false);
  },
);
it('the authoring field registers scenario constraints and the publication validator enforces the same shape', () => {
  const definition = parameterReference();
  const scenarios = definition.fields?.find((item) => item.name === 'scenarios');
  const constraints = scenarios?.fields?.find((item) => item.name === 'inputConstraints');
  expect(constraints?.type).toBe('array');
  expect(constraints?.fields?.find((item) => item.name === 'field')?.localized).toBe(false);
  const run = definition.validate?.run;
  if (!run) throw new Error('Parameter reference needs publication validation');
  const invalid = reference([{ field: 'count', min: 20 }]);
  expect(run(invalid, { data: {}, locale: 'en', mode: 'publish' })).toBe(false);
  expect(run(invalid, { data: {}, locale: 'en', mode: 'draft' })).toBe(true);
});
