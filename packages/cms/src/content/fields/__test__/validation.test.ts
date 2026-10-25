import { remapReferencePath } from '../remap-reference-path.ts';
import { dataFieldInstances } from '../structure.ts';
import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  contentDefinitions,
  contentLimits,
  articleData,
} from '../../../../../../test/support/content.ts';
import { validateData } from '../validate-data.ts';
import { collectReferences } from '../collect-references.ts';
import { createRegistry } from '../../collections/create-registry.ts';
import type { DocumentData, JsonValue } from '../../definition.ts';

function validate(data: unknown, mode: 'draft' | 'publish' = 'publish') {
  return validateData({
    collection: createRegistry({ collections: contentDefinitions(), limits: contentLimits() }).get(
      'articles',
    ),
    data,
    mode,
    locale: 'en',
    limits: contentLimits(),
    applyDefaults: true,
  });
}
it('validates every scalar, compound and display field without changing caller data', () => {
  const data = articleData();
  expect(validate(data)).toEqual(data);
  expect(data['sections']).toEqual([
    {
      id: '10000000-0000-4000-8000-000000000001',
      heading: 'Section',
      items: [{ id: '10000000-0000-4000-8000-000000000002', label: 'Nested' }],
    },
  ]);
  expect(validate({ title: 'Title' })).toEqual({ title: 'Title', enabled: false });
  expect(validate({}, 'draft')).toEqual({ enabled: false });
  expect(() => validate({})).toThrowError('invalid input');
});
it.each<[string, JsonValue]>([
  ['score', -1],
  ['score', 100.001],
  ['score', 0.001],
  ['enabled', 'false'],
  ['title', null],
  ['title', ''],
  ['date', '2026-10-26'],
  ['date', '2026-02-30T00:00:00Z'],
  ['contact', 'bad'],
  ['categories', ['news', 'news']],
  ['categories', ['unknown']],
  ['location', [181, 0]],
  ['location', [0, 91]],
  ['extra', { constructor: 'bad' }],
  ['sections', [{ id: randomUUID(), bad: true }]],
  ['layout', [{ blockType: 'unknown' }]],
])('rejects invalid %s values', (field, value) => {
  expect(() => validate(articleData({ [field]: value }))).toThrowError('invalid input');
});
it('rejects unknown fields and structural identity collisions while preserving zero/false/null', () => {
  expect(() => validate(articleData({ unknown: true }))).toThrowError('invalid input');
  const item = { id: randomUUID(), heading: 'One' };
  expect(() => validate(articleData({ sections: [item, item] }))).toThrowError('invalid input');
  expect(validate(articleData({ score: 0, enabled: false, seo: null }))).toMatchObject({
    score: 0,
    enabled: false,
    seo: null,
  });
  const result = validate(articleData({ sections: [{ heading: 'Generated' }] }));
  const { sections } = result;
  if (!Array.isArray(sections)) throw new Error('Expected sections');
  const [section] = sections;
  expect(section).toHaveProperty('heading', 'Generated');
  expect(section).toHaveProperty('id');
});
it.each([
  'javascript:alert(1)',
  'data:text/html,x',
  '//evil.test',
  '\\evil.test',
  'https:\n//evil.test',
])('rejects unsafe rich text link %s', (url) => {
  expect(() =>
    validate(
      articleData({ body: { version: 1, children: [{ type: 'link', url, children: [] }] } }),
    ),
  ).toThrowError('invalid input');
});
it('rejects unknown rich text nodes, versions and over-budget nested content', () => {
  expect(() => validate(articleData({ body: { version: 2, children: [] } }))).toThrowError(
    'invalid input',
  );
  expect(() =>
    validate(articleData({ body: { version: 1, children: [{ type: 'html', text: '<script>' }] } })),
  ).toThrowError('invalid input');
  const collection = createRegistry({
    collections: contentDefinitions(),
    limits: contentLimits(),
  }).get('articles');
  expect(() =>
    validateData({
      collection,
      data: articleData(),
      mode: 'publish',
      locale: 'en',
      limits: contentLimits({ maxDataBytes: 10 }),
    }),
  ).toThrowError('payload too large');
});
it('extracts ordered polymorphic and rich text media references through nested data', () => {
  const id = randomUUID();
  const data = validate(
    articleData({
      author: { collection: 'pages', id },
      related: [{ collection: 'pages', id }],
      body: { version: 1, children: [{ type: 'media', collection: 'pages', id }] },
    }),
  );
  const [collection] = contentDefinitions();
  if (!collection) throw new Error('Missing collection');
  const refs = collectReferences({ collection, data, locale: 'en', limits: contentLimits() });
  expect(
    refs.map(({ collection: targetCollection, id: target, path, media }) => ({
      collection: targetCollection,
      id: target,
      path,
      media,
    })),
  ).toEqual([
    { collection: 'pages', id, path: 'author', media: false },
    { collection: 'pages', id, path: 'related.0', media: false },
    { collection: 'pages', id, path: 'body.children.0', media: true },
  ]);
});
it('rejects garbage data shapes at the public validation boundary', () => {
  for (const input of [null, [], true, 'text', 1])
    expect(() => validate(input)).toThrowError('invalid input');
  const input: DocumentData = { title: 'A', score: NaN };
  expect(() => validate(input)).toThrowError('invalid input');
});
it('schema path remapping preserves stable array identities and rich text node positions', () => {
  const [from] = contentDefinitions();
  if (!from) throw new Error('Missing article');
  const to = {
    ...from,
    schemaVersion: 2,
    fields: from.fields.map((field) => {
      if (field.id === 'body') return { ...field, name: 'content' };
      if (field.id !== 'sections') return field;
      return {
        ...field,
        name: 'rows',
        fields: (field.fields ?? []).map((child) =>
          child.id === 'section_heading' ? { ...child, name: 'title' } : child,
        ),
      };
    }),
  };
  expect(
    remapReferencePath({ from, to, path: 'body.children.0.children.1', fieldId: 'body' }),
  ).toBe('content.children.0.children.1');
  expect(
    remapReferencePath({ from, to, path: 'sections.10000000-0000-4000-8000-000000000001.heading' }),
  ).toBe('rows.10000000-0000-4000-8000-000000000001.title');
  expect(
    remapReferencePath({ from: to, to: from, path: 'content.children.0', fieldId: 'body' }),
  ).toBe('body.children.0');
  expect(() => remapReferencePath({ from, to, path: 'missing' })).toThrowError('invalid input');
  const instances = dataFieldInstances({ fields: from.fields, data: validate(articleData()) });
  expect(
    instances.some(
      (instance) =>
        instance.path ===
        'sections.10000000-0000-4000-8000-000000000001.items.10000000-0000-4000-8000-000000000002.label',
    ),
  ).toBe(true);
});
it('deep legal JSON below the byte budget is rejected before recursive serialization can overflow', () => {
  const source = `${'['.repeat(20000)}0${']'.repeat(20000)}`;
  expect(Buffer.byteLength(source)).toBeLessThan(contentLimits().maxDataBytes);
  const value: unknown = JSON.parse(source);
  expect(() => validate({ title: 'Title', extra: value })).toThrowError('payload too large');
  const cycle: Record<string, unknown> = {};
  cycle['self'] = cycle;
  expect(() => validate({ title: 'Title', extra: cycle })).toThrowError('invalid input');
  expect(() => validate({ title: 'Title', extra: BigInt(1) })).toThrowError('invalid input');
});
it('trusted field validators must return synchronous booleans', () => {
  const validation = { version: '1', run: () => true };
  Reflect.set(validation, 'run', () => Promise.resolve(false));
  const [definition] = contentDefinitions();
  if (!definition) throw new Error('Missing collection');
  const collection = {
    ...definition,
    fields: [{ id: 'sample', name: 'sample', type: 'text' as const, validate: validation }],
  };
  expect(() =>
    validateData({
      collection,
      data: { sample: 'Value' },
      mode: 'draft',
      locale: 'en',
      limits: contentLimits(),
    }),
  ).toThrowError('invalid input');
});
