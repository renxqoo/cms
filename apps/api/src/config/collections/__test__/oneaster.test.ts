import { expect, it } from 'vitest';
import { createRegistry } from '@new-cms/cms/content/generate';
import type {
  CollectionDefinition,
  FieldDefinition,
  JsonValue,
} from '@new-cms/cms/content/generate';
import { contentLimits } from '../../content-policy.ts';
import { collections } from '../index.ts';
import { applicationOperations } from '../../operations.ts';
function collection(key: string): CollectionDefinition {
  const result = collections.find((item) => item.key === key);
  if (!result) throw new Error('Collection is missing');
  return result;
}
function field(key: string, name: string): FieldDefinition {
  const result = collection(key).fields.find((item) => item.name === name);
  if (!result) throw new Error('Field is missing');
  return result;
}
it('registers editable OneAster business records without replacing original CMS collections', () => {
  const registry = createRegistry({
    collections,
    operations: applicationOperations,
    limits: contentLimits(),
  });
  expect(registry.list.map((item) => item.key)).toEqual(
    expect.arrayContaining([
      'articles',
      'pages',
      'media',
      'settings',
      'models',
      'developers',
      'documents',
      'site',
      'home',
      'languages',
      'message-bundles',
    ]),
  );
  expect(field('models', 'modelId')).toMatchObject({
    localized: false,
    unique: true,
    required: true,
  });
  expect(field('models', 'apiBindings').type).toBe('array');
  expect(field('models', 'technicalCapabilities').type).toBe('group');
  expect(field('site', 'header').type).toBe('group');
  expect(field('home', 'hero').type).toBe('group');
  expect(field('documents', 'body').type).toBe('group');
});
it('rejects whitespace, control characters and byte overflow without rewriting valid model IDs', () => {
  const validate = field('models', 'modelId').validate?.run;
  if (!validate) throw new Error('Model identity rule is missing');
  const context = { data: {}, locale: 'en', mode: 'draft' as const };
  expect(validate('Provider/Case:v1', context)).toBe(true);
  for (const value of [' Provider', 'Provider ', 'x\n', '\u0000', '😀'.repeat(51)])
    expect(validate(value, context)).toBe(false);
});
const check = (name: string, value: JsonValue) =>
  field('models', name).validate?.run(value, { data: {}, locale: 'en', mode: 'publish' });

it('requires distinct selected content locales and a real business slug', () => {
  expect(check('contentLocales', ['en', 'zh'])).toBe(true);
  expect(check('contentLocales', ['en', 'en'])).toBe(false);
  expect(check('contentLocales', [])).toBe(false);
  expect(check('slug', 'vendor-model-3')).toBe(true);
  expect(check('slug', 'Upper_case')).toBe(false);
});
it('keeps core execution binding defaults coherent and permits vector-only display records', () => {
  const validate = field('models', 'apiBindings').validate?.run;
  if (!validate) throw new Error('Binding rule is missing');
  const data = {
    modelId: 'Embedding/V1',
    technicalCapabilities: {
      inputs: ['text'],
      outputs: ['vector'],
      tasks: ['embedding'],
      features: [],
    },
    apiBindings: [],
    defaultBindingKey: null,
  };
  expect(validate([], { data, locale: 'en', mode: 'publish' })).toBe(true);
  expect(
    validate([], {
      data: { ...data, defaultBindingKey: 'missing' },
      locale: 'en',
      mode: 'publish',
    }),
  ).toBe(false);
});
it('rejects unsupported body fields in a partial binding draft before publication', () => {
  const validate = field('models', 'apiBindings').validate?.run;
  if (!validate) throw new Error('Binding rule is missing');
  const binding = {
    key: 'chat',
    profileKey: 'core.chat',
    enabledFlowKeys: ['chat.json'],
    scenarios: [
      {
        key: 'hello',
        flowKey: 'chat.json',
        requestValues: {
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 100,
          api_key: 'not-a-key',
        },
      },
    ],
  };
  expect(
    validate([binding], {
      data: { modelId: 'model', apiBindings: [binding] },
      locale: 'en',
      mode: 'draft',
    }),
  ).toBe(false);
});
function nestedField(collectionKey: string, path: readonly string[]): FieldDefinition {
  let { fields } = collection(collectionKey);
  let found: FieldDefinition | undefined;
  for (const name of path) {
    found = fields.find((item) => item.name === name);
    fields = found?.fields ?? [];
  }
  if (!found) throw new Error('Nested field is missing');
  return found;
}
it('uses dynamic language publication for public records while bootstrap language records stay nonlocalized', () => {
  for (const key of ['models', 'developers', 'documents', 'site', 'home']) {
    expect(collection(key)).toMatchObject({
      localeSource: 'languages',
      publicationLocalesField: 'contentLocales',
    });
    expect(field(key, 'contentLocales').type).toBe('json');
  }
  for (const key of ['languages', 'message-bundles']) {
    expect(collection(key).localeSource).toBeUndefined();
    expect(collection(key).locales.supported).toEqual(['en']);
    expect(collection(key).fields.some((item) => item.localized)).toBe(false);
  }
});
it('validates language identifiers, two-line presentation text and required model technical declarations', () => {
  for (const [key, name] of [
    ['languages', 'code'],
    ['message-bundles', 'locale'],
  ]) {
    const validator = field(key ?? '', name ?? '').validate?.run;
    if (!validator) throw new Error('Locale rule is missing');
    expect(validator('en-US', { data: {}, locale: 'en', mode: 'draft' })).toBe(true);
    expect(validator('invalid_locale', { data: {}, locale: 'en', mode: 'draft' })).toBe(false);
  }
  const validator = nestedField('home', ['workspace', 'heading', 'titleLines']).validate?.run;
  if (!validator) throw new Error('Line rule is missing');
  expect(validator(['First', 'Second'], { data: {}, locale: 'en', mode: 'publish' })).toBe(true);
  expect(validator(['Only one'], { data: {}, locale: 'en', mode: 'publish' })).toBe(false);
  expect(validator([1, 2], { data: {}, locale: 'en', mode: 'publish' })).toBe(false);
  const technical = field('models', 'technicalCapabilities').validate?.run;
  if (!technical) throw new Error('Technical rule is missing');
  expect(technical({}, { data: {}, locale: 'en', mode: 'draft' })).toBe(true);
  expect(technical({}, { data: {}, locale: 'en', mode: 'publish' })).toBe(false);
  expect(
    technical(
      { inputs: ['text'], outputs: ['vector'] },
      { data: {}, locale: 'en', mode: 'publish' },
    ),
  ).toBe(true);
});
it('keeps incomplete parameter documents editable and validates their final published structure', () => {
  const validator = field('models', 'parameterReference').validate?.run;
  if (!validator) throw new Error('Parameter rule is missing');
  expect(validator({}, { data: {}, locale: 'en', mode: 'draft' })).toBe(true);
  expect(validator({}, { data: {}, locale: 'en', mode: 'publish' })).toBe(false);
  expect(validator({ fields: [] }, { data: {}, locale: 'en', mode: 'publish' })).toBe(true);
});
it('rejects scalar, blank and oversized source support lists before publishing an unreadable model', () => {
  const validator = nestedField('models', ['content', 'sources', 'supports']).validate?.run;
  if (!validator) throw new Error('Missing source support rule');
  const context = { data: {}, locale: 'en', mode: 'publish' as const };
  for (const value of ['facts', [true], [' '], ['x'.repeat(2001)], Array(101).fill('fact')])
    expect(validator(value, context)).toBe(false);
  expect(validator([], context)).toBe(true);
  expect(validator(['Context window', 'Pricing reference'], context)).toBe(true);
  expect(validator('incomplete', { ...context, mode: 'draft' })).toBe(true);
});
it('rejects whitespace-only optional metadata and constrains all published numbers to safe magnitudes', () => {
  for (const path of [
    ['family'],
    ['version'],
    ['specifications', 'text', 'licenseName'],
    ['content', 'sources', 'kind'],
  ]) {
    const validator = nestedField('models', path).validate?.run;
    if (!validator) throw new Error('Missing optional text rule');
    const context = { data: {}, locale: 'en', mode: 'publish' as const };
    expect(validator('   ', context)).toBe(false);
    expect(validator('', context)).toBe(true);
    expect(validator('Reviewed metadata', context)).toBe(true);
  }
  for (const path of [
    ['presentation', 'sortOrder'],
    ['specifications', 'text', 'contextWindowTokens'],
    ['specifications', 'text', 'maxOutputTokens'],
  ])
    expect(nestedField('models', path).max).toBe(Number.MAX_SAFE_INTEGER);
});
