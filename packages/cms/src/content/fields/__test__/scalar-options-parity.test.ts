import { expect, it } from 'vitest';
import { createRegistry, generateArtifacts } from '../../generate.ts';
import { validateData } from '../validate-data.ts';
import { contentLimits } from '../../../../../../test/support/content.ts';
import type { CollectionDefinition, FieldDefinition } from '../../definition.ts';

function collection(fields: readonly FieldDefinition[]): CollectionDefinition {
  return {
    id: 'scalar_options',
    key: 'scalars',
    label: 'Scalars',
    schemaVersion: 1,
    mode: 'direct',
    history: false,
    locales: { default: 'en', supported: ['en', 'zh'], fallback: {} },
    fields,
  };
}

it('accepts ordered repeated text and number values while enforcing each element and row limit', async () => {
  const definition = collection([
    {
      id: 'aliases',
      name: 'aliases',
      type: 'text',
      hasMany: true,
      minRows: 2,
      maxRows: 3,
      minLength: 1,
      maxLength: 5,
    },
    {
      id: 'ratings',
      name: 'ratings',
      type: 'number',
      hasMany: true,
      minRows: 1,
      maxRows: 3,
      min: 0,
      max: 10,
    },
  ]);
  const registry = createRegistry({ collections: [definition], limits: contentLimits() });
  const input = {
    collection: registry.get('scalars'),
    locale: 'en',
    mode: 'publish' as const,
    limits: contentLimits(),
  };
  expect(
    await validateData({ ...input, data: { aliases: ['same', 'same'], ratings: [0, 10, 0] } }),
  ).toEqual({ aliases: ['same', 'same'], ratings: [0, 10, 0] });
  for (const aliases of [['one'], ['one', 'two', 'three', 'four'], ['', 'ok'], ['too-long', 'ok']])
    await expect(async () =>
      validateData({ ...input, data: { aliases, ratings: [1] } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  for (const ratings of [[-1], [11], ['3'], [null]])
    await expect(async () =>
      validateData({ ...input, data: { aliases: ['ok', 'ok'], ratings } }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('validates radio and labelled select options by stored values and rejects duplicate values with different labels', async () => {
  const definition = collection([
    {
      id: 'tone',
      name: 'tone',
      type: 'radio',
      options: [
        { value: 'calm', label: { en: 'Calm', zh: '平静' } },
        { value: 'bold', label: 'Bold' },
      ],
    },
    {
      id: 'states',
      name: 'states',
      type: 'select',
      hasMany: true,
      options: ['draft', { value: 'live', label: 'Published' }],
    },
  ]);
  const registry = createRegistry({ collections: [definition], limits: contentLimits() });
  const input = {
    collection: registry.get('scalars'),
    locale: 'zh',
    mode: 'publish' as const,
    limits: contentLimits(),
  };
  expect(
    await validateData({ ...input, data: { tone: 'calm', states: ['live', 'draft'] } }),
  ).toEqual({ tone: 'calm', states: ['live', 'draft'] });
  await expect(async () =>
    validateData({ ...input, data: { tone: '平静' } }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(() =>
    createRegistry({
      collections: [
        collection([
          {
            id: 'choice',
            name: 'choice',
            type: 'radio',
            options: ['same', { value: 'same', label: 'Duplicate' }],
          },
        ]),
      ],
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
  const generated = generateArtifacts(registry);
  expect(generated.types).toContain('"calm" | "bold"');
  expect(generated.types).not.toContain('平静');
});
