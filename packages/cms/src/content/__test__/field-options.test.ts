import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition } from '../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

function definitions() {
  const collections = workflowCollections();
  const pages = contentCollection(collections, 'pages');
  pages.search = ['title'];
  pages.defaultSort = [{ field: 'title', order: 'asc' }];
  pages.fields = [...pages.fields, { id: 'kind', name: 'kind', type: 'text', index: true }];
  pages.access = {
    'documents.get': {
      version: 'v1',
      run: () => ({ field: 'title', operator: 'ne', value: 'Private' }),
    },
  };
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'kind', name: 'kind', type: 'text' },
    {
      id: 'chosen',
      name: 'chosen',
      type: 'relationship',
      relationTo: ['pages'],
      filterOptions: {
        version: 'v1',
        run: ({ data, relationTo }) =>
          relationTo === 'pages'
            ? { field: 'kind', operator: 'eq', value: data['kind'] ?? null }
            : false,
      },
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'row_kind', name: 'kind', type: 'text' },
        {
          id: 'row_target',
          name: 'target',
          type: 'relationship',
          relationTo: ['pages'],
          filterOptions: {
            version: 'v1',
            run: ({ siblingData }) => ({
              field: 'kind',
              operator: 'eq',
              value: siblingData['kind'] ?? null,
            }),
          },
        },
      ],
    },
    {
      id: 'hidden',
      name: 'hidden',
      type: 'relationship',
      relationTo: ['pages'],
      filterOptions: { version: 'hidden', run: () => true },
      access: { read: { version: 'never', run: () => false } },
    },
    {
      id: 'denied',
      name: 'denied',
      type: 'relationship',
      relationTo: ['pages'],
      filterOptions: { version: 'v1', run: () => false },
    },
  ];
  return collections;
}

async function fixture(collections: CollectionDefinition[] = definitions()) {
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const targets = [];
  for (const [title, kind] of [
    ['Alpha', 'news'],
    ['Beta', 'news'],
    ['Guide', 'guide'],
    ['Private', 'news'],
  ])
    targets.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'pages',
        data: { title, kind },
      }),
    );
  const [news, , guide] = targets;
  if (!news || !guide) throw new Error('Missing target fixture');
  return { kit, news, guide };
}

it('filters with incomplete unsaved candidate values before pagination, counts and search and intersects target read access', async () => {
  const { kit, news, guide } = await fixture();
  const candidate = { collection: 'articles', intent: 'create', data: { kind: 'news' } };
  const page = await kit.content.api.getFieldOptions(kit.owner(), {
    collection: 'articles',
    candidate,
    path: 'chosen',
    relationTo: 'pages',
    pageSize: 1,
    page: 2,
  });
  expect(page).toMatchObject({
    total: 2,
    page: 2,
    pageSize: 1,
    rows: [{ data: { title: 'Beta' } }],
  });
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate,
      path: 'chosen',
      relationTo: 'pages',
      q: 'Private',
    }),
  ).toMatchObject({ total: 0, rows: [] });
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate,
      path: 'denied',
      relationTo: 'pages',
    }),
  ).toMatchObject({ total: 0, rows: [] });
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate,
      path: 'chosen',
      relationTo: 'pages',
      id: news.id,
    }),
  ).toMatchObject({ total: 1, rows: [{ id: news.id }] });
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate,
      path: 'chosen',
      relationTo: 'pages',
      id: guide.id,
    }),
  ).toMatchObject({ total: 0, rows: [] });
  await expect(
    kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate,
      path: 'hidden',
      relationTo: 'pages',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'pages',
      candidate,
      path: 'chosen',
      relationTo: 'pages',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('binds sibling filters to stable array row identities and rejects ineligible values on save and autosave', async () => {
  const { kit, news, guide } = await fixture();
  const row = '10000000-0000-4000-8000-000000000099';
  const candidate = {
    collection: 'articles',
    intent: 'create',
    data: { rows: [{ id: row, kind: 'guide' }] },
  };
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate,
      path: `rows.${row}.target`,
      relationTo: 'pages',
    }),
  ).toMatchObject({ total: 1, rows: [{ id: guide.id }] });
  const target = { collection: 'pages', id: news.id };
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Bad root', kind: 'guide', chosen: target },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Bad row', rows: [{ id: row, kind: 'guide', target }] },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Allowed', kind: 'news', chosen: target },
  });
  await expect(
    kit.content.api.autosaveDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: source.revision,
      data: { kind: 'guide' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: source.id }),
  ).toMatchObject({ revision: source.revision, data: { kind: 'news', chosen: target } });
  await expect(
    kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate: {
        collection: 'articles',
        id: source.id,
        revision: source.revision + 1,
        intent: 'update',
        data: { kind: 'news' },
      },
      path: 'chosen',
      relationTo: 'pages',
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'pages',
    id: news.id,
    revision: news.revision,
    data: { kind: 'guide' },
  });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: source.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.copyDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: source.revision,
      data: { title: 'Copy' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('shows only collection-specific tags eligible for the source collection, including unrestricted empty scopes', async () => {
  const collections = workflowCollections();
  for (const source of collections.filter((collection) =>
    ['articles', 'pages'].includes(collection.key),
  ))
    source.fields = [
      ...source.fields,
      { id: 'tags', name: 'tags', type: 'relationship', relationTo: ['tags'], hasMany: true },
    ];
  collections.push({
    id: 'scoped_tags',
    key: 'tags',
    schemaVersion: 1,
    label: 'Tags',
    mode: 'direct',
    history: false,
    locales: { default: 'en', supported: ['en', 'zh'], fallback: {} },
    tags: { collectionSpecific: true },
    fields: [{ id: 'title', name: 'title', type: 'text', required: true }],
    search: ['title'],
  });
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const tags = [];
  for (const [title, hierarchyType] of [
    ['Common', []],
    ['Article only', ['articles']],
    ['Page only', ['pages']],
  ] as const)
    tags.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'tags',
        data: { title, hierarchyType: [...hierarchyType] },
      }),
    );
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    intent: 'create',
  });
  expect(editor.layout.find((field) => field.name === 'tags')).toMatchObject({
    constraints: { filterOptions: true },
  });
  const result = await kit.content.api.getFieldOptions(kit.owner(), {
    collection: 'articles',
    candidate: { collection: 'articles', intent: 'create', data: {} },
    path: 'tags',
    relationTo: 'tags',
    pageSize: 1,
  });
  expect(result.total).toBe(2);
  expect(result.rows).toHaveLength(1);
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      collection: 'articles',
      candidate: { collection: 'articles', intent: 'create', data: {} },
      path: 'tags',
      relationTo: 'tags',
      q: 'Page only',
    }),
  ).toMatchObject({ total: 0, rows: [] });
  const [, , forbidden] = tags;
  if (!forbidden) throw new Error('Missing excluded tag');
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Rejected', tags: [{ collection: 'tags', id: forbidden.id }] },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('intersects filters for every current bulk candidate before counting or pagination and rejects stale sources', async () => {
  const { kit } = await fixture();
  const sources = [];
  for (const kind of ['news', 'guide'])
    sources.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title: kind, kind },
      }),
    );
  const candidates = sources.map((source) => ({
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    intent: 'update',
    data: {},
  }));
  const values = { collection: 'articles', path: 'chosen', relationTo: 'pages', pageSize: 1 };
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), { ...values, candidate: candidates }),
  ).toMatchObject({ total: 0, rows: [] });
  expect(
    await kit.content.api.getFieldOptions(kit.owner(), {
      ...values,
      candidate: candidates.map((candidate) => ({ ...candidate, data: { kind: 'news' } })),
      page: 2,
    }),
  ).toMatchObject({ total: 2, rows: [{ data: { title: 'Beta' } }] });
  const [first] = sources;
  if (!first) throw new Error('Missing bulk source');
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { title: 'New revision' },
  });
  await expect(
    kit.content.api.getFieldOptions(kit.owner(), { ...values, candidate: candidates }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await expect(
    kit.content.api.getFieldOptions(kit.owner(), {
      ...values,
      candidate: [candidates[0], candidates[0]],
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
