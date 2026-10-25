import { expect, it } from 'vitest';
import type { Principal } from '@new-cms/cms/access';
import {
  contentDefinitions,
  contentLimits,
  articleData,
} from '../../../../../../test/support/content.ts';
import { createRegistry } from '../../collections/create-registry.ts';
import {
  projectData,
  assertWritableData,
  queryableFields,
  collectionMetadata,
} from '../policies.ts';
import type {
  FieldDefinition,
  FieldPolicyContext,
  CollectionDefinition,
} from '../../definition.ts';
const time = '2026-10-26T00:00:00.000Z';
const actor: Principal = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'actor@example.test',
  displayName: null,
  roleId: '10000000-0000-4000-8000-000000000002',
  roleCode: 'editor',
  status: 'active',
  activation: 'activated',
  version: 1,
  createdAt: time,
  updatedAt: time,
  lastLoginAt: null,
  role: {
    id: '10000000-0000-4000-8000-000000000002',
    code: 'editor',
    name: 'Editor',
    description: null,
    status: 'active',
    isSuper: false,
    version: 1,
    createdAt: time,
    updatedAt: time,
  },
};
const context: FieldPolicyContext = {
  actor,
  operation: 'read',
  collectionKey: 'articles',
  locale: 'en',
};
const deny = { version: '1', run: () => false };
const allow = { version: '1', run: () => true };
function collection(fields?: readonly FieldDefinition[]): CollectionDefinition {
  const definitions = contentDefinitions();
  const [article] = definitions;
  if (!article) throw new Error('Missing article');
  return createRegistry({
    collections: [
      { ...article, ...(fields ? { fields } : {}), search: [], defaultSort: [] },
      ...definitions.slice(1).map((definition) => ({
        ...definition,
        fields: definition.fields.filter((field) => field.type !== 'join'),
      })),
    ],
    limits: contentLimits(),
  }).get('articles');
}
it('reads only allowed fields, including nested groups/arrays/blocks and projection selections', () => {
  const original = collection();
  const definition = collection(
    original.fields.map((field) =>
      field.id === 'slug' ? { ...field, access: { read: deny } } : field,
    ),
  );
  const full = projectData({ collection: definition, data: articleData(), context });
  expect(full['slug']).toBeUndefined();
  expect(full['score']).toBe(0);
  expect(
    projectData({
      collection: definition,
      data: articleData(),
      context,
      select: ['title', 'seo.description'],
    }),
  ).toEqual({ title: 'Alpha', seo: { description: 'Search description' } });
  expect(
    projectData({
      collection: definition,
      data: articleData({ seo: null, sections: null, layout: null }),
      context,
      select: [],
    }),
  ).toEqual({});
  const nested = collection([
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [{ id: 'secret', name: 'secret', type: 'text', access: { read: deny } }],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [{ id: 'row_secret', name: 'secret', type: 'text', access: { read: deny } }],
    },
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'block',
          key: 'example',
          label: 'Example',
          fields: [{ id: 'block_secret', name: 'secret', type: 'text', access: { read: deny } }],
        },
      ],
    },
  ]);
  expect(
    projectData({
      collection: nested,
      data: {
        group: { secret: 'hidden' },
        rows: [{ id: 'a', secret: 'hidden' }],
        blocks: [{ id: 'b', blockType: 'example', secret: 'hidden' }],
      },
      context,
    }),
  ).toEqual({ group: {}, rows: [{ id: 'a' }], blocks: [{ id: 'b', blockType: 'example' }] });
});
it('denies writes at each nested boundary and read-only joins cannot be written', () => {
  const original = collection();
  for (const type of ['text', 'group', 'array', 'blocks'] as const) {
    const denied: FieldDefinition = {
      id: 'denied',
      name: 'denied',
      type,
      access: { write: deny },
      ...(type === 'group' || type === 'array' ? { fields: [] } : {}),
      ...(type === 'blocks' ? { blocks: [{ id: 'b', key: 'b', label: 'B', fields: [] }] } : {}),
    };
    const definition = collection([denied]);
    expect(() =>
      assertWritableData({ collection: definition, data: { denied: null }, context }),
    ).toThrowError('forbidden');
  }
  const nested = collection([
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [{ id: 'secret', name: 'secret', type: 'text', access: { write: deny } }],
    },
  ]);
  expect(() =>
    assertWritableData({ collection: nested, data: { group: { secret: 'value' } }, context }),
  ).toThrowError('forbidden');
  expect(() =>
    assertWritableData({ collection: original, data: articleData(), context }),
  ).not.toThrow();
  const pages = createRegistry({ collections: contentDefinitions(), limits: contentLimits() }).get(
    'pages',
  );
  expect(() =>
    assertWritableData({
      collection: pages,
      data: { articles: [] },
      context: { ...context, collectionKey: 'pages' },
    }),
  ).toThrowError('forbidden');
});
it('query and metadata protect parent boundaries and data-dependent hidden field names', () => {
  const definition = collection([
    { id: 'public', name: 'public', type: 'text' },
    { id: 'secret', name: 'secret', type: 'text', access: { read: deny } },
    { id: 'known', name: 'known', type: 'text', access: { read: allow, query: allow } },
    {
      id: 'group',
      name: 'group',
      type: 'group',
      access: { read: deny },
      fields: [{ id: 'child', name: 'child', type: 'text' }],
    },
  ]);
  expect(queryableFields({ collection: definition, context })).toEqual(['public', 'known']);
  const metadata = collectionMetadata({ collection: definition, context });
  expect(JSON.stringify(metadata)).not.toContain('secret');
  expect(JSON.stringify(metadata)).not.toContain('child');
  expect(metadata).toMatchObject({
    dataSchema: { required: [], properties: { public: {}, known: {} } },
  });
  expect(JSON.stringify(metadata)).not.toContain('run');
});
it('readonly descendants survive partial merge and cannot be deleted by null, row removal or a block-type replacement', () => {
  const definition = collection([
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [
        { id: 'secret', name: 'secret', type: 'text', access: { write: deny } },
        { id: 'visible', name: 'visible', type: 'text' },
      ],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [{ id: 'row_secret', name: 'secret', type: 'text', access: { write: deny } }],
    },
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'protected',
          key: 'protected',
          label: 'Protected',
          fields: [{ id: 'block_secret', name: 'secret', type: 'text', access: { write: deny } }],
        },
        { id: 'empty', key: 'empty', label: 'Empty', fields: [] },
      ],
    },
  ]);
  const previous = {
    group: { secret: 'retained', visible: 'old' },
    rows: [{ id: 'row', secret: 'retained' }],
    blocks: [{ id: 'block', blockType: 'protected', secret: 'retained' }],
  };
  const next = { ...previous, group: { secret: 'retained', visible: 'new' } };
  expect(() =>
    assertWritableData({
      collection: definition,
      data: { group: { visible: 'new' } },
      previous,
      next,
      context,
    }),
  ).not.toThrow();
  expect(() =>
    assertWritableData({
      collection: definition,
      data: { group: { secret: 'retained' } },
      previous,
      next,
      context,
    }),
  ).toThrowError('forbidden');
  for (const patch of [
    { group: null },
    { rows: [] },
    { blocks: [{ id: 'block', blockType: 'empty' }] },
  ])
    expect(() =>
      assertWritableData({
        collection: definition,
        data: patch,
        previous,
        next: { ...previous, ...patch },
        context,
      }),
    ).toThrowError('forbidden');
  const allowed = collection([
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [{ id: 'secret', name: 'secret', type: 'text', access: { write: allow } }],
    },
  ]);
  expect(() =>
    assertWritableData({
      collection: allowed,
      data: { group: null },
      previous: { group: { secret: 'old' } },
      next: { group: null },
      context,
    }),
  ).not.toThrow();
});
it('write context receives previous and final snapshots while explicit hidden values never bypass policy by equality', () => {
  const definition = collection([
    {
      id: 'value',
      name: 'value',
      type: 'text',
      access: {
        write: {
          version: 'snapshots',
          run: (input) =>
            input.previousData?.['value'] === 'old' && input.nextData?.['value'] === 'next',
        },
      },
    },
  ]);
  expect(() =>
    assertWritableData({
      collection: definition,
      data: { value: 'next' },
      previous: { value: 'old' },
      next: { value: 'next' },
      context,
    }),
  ).not.toThrow();
  expect(() =>
    assertWritableData({
      collection: definition,
      data: { value: 'old' },
      previous: { value: 'old' },
      next: { value: 'old' },
      context,
    }),
  ).toThrowError('forbidden');
  expect(() =>
    projectData({ collection: definition, data: { value: 'old' }, context, select: ['typo'] }),
  ).toThrowError('invalid input');
  expect(() =>
    projectData({
      collection: definition,
      data: { value: 'old' },
      context,
      select: ['value', 'value'],
    }),
  ).toThrowError('invalid input');
});
