import { afterEach, expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { createContent } from '../../composition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture() {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    {
      id: 'categories',
      name: 'categories',
      type: 'select',
      hasMany: true,
      options: ['red', 'blue'],
    },
    {
      id: 'items',
      name: 'items',
      type: 'array',
      fields: [{ id: 'category', name: 'category', type: 'text' }],
    },
    { id: 'page_title', name: 'pageTitle', type: 'text', virtual: 'related.title' },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('groups distinct numeric and null values in SQL and independently pages documents within each group', async () => {
  const kit = await fixture();
  const docs = [];
  for (const data of [
    { title: 'Alpha', score: 1 },
    { title: 'Bravo', score: 1 },
    { title: 'Charlie', score: 2 },
    { title: 'Delta' },
    { title: 'Echo', score: null },
  ])
    docs.push(await kit.content.api.createDocument(kit.owner(), { collection: 'articles', data }));
  const first = await kit.content.api.groupDocuments(kit.owner(), {
    collection: 'articles',
    groupBy: { field: 'score', order: 'asc' },
    groupPageSize: 1,
    sort: [{ field: 'title', order: 'asc' }],
  });
  expect(first.total).toBe(3);
  expect(first.rows.map((group) => group.value)).toEqual([1, 2, null]);
  expect(first.rows.map((group) => group.documents.total)).toEqual([2, 1, 2]);
  expect(first.rows.map((group) => group.documents.rows[0]?.data['title'])).toEqual([
    'Alpha',
    'Charlie',
    'Delta',
  ]);
  const [one] = first.rows;
  if (!one) throw new Error('Missing group');
  const paged = await kit.content.api.groupDocuments(kit.owner(), {
    collection: 'articles',
    groupBy: { field: 'score', order: 'asc' },
    groupPageSize: 1,
    queryByGroup: { [one.key]: { page: 2 } },
    sort: [{ field: 'title', order: 'asc' }],
  });
  expect(paged.rows[0]?.documents).toMatchObject({
    page: 2,
    pageSize: 1,
    total: 2,
    rows: [{ id: docs[1]?.id }],
  });
  expect(paged.rows[1]?.documents.page).toBe(1);
  expect(paged.rows[0]?.key).toBe(one.key);
  expect(
    await kit.content.api.distinctDocuments(kit.owner(), {
      collection: 'articles',
      field: 'score',
      order: 'desc',
      pageSize: 2,
    }),
  ).toEqual({ rows: [null, 2], total: 3, page: 1, pageSize: 2 });
  expect(
    await kit.content.api.distinctDocuments(kit.owner(), {
      collection: 'articles',
      field: 'score',
      order: 'asc',
      pageSize: 1,
      page: 4,
    }),
  ).toEqual({ rows: [], total: 3, page: 4, pageSize: 1 });
});

it('includes each repeated or multiselect value once while preserving null groups and matching document membership', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Alpha',
      categories: ['red', 'blue'],
      items: [{ category: 'One' }, { category: 'One' }, { category: 'Two' }],
    },
  });
  const b = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Bravo', categories: ['red'], items: [{ category: 'Two' }] },
  });
  const c = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Charlie', categories: [], items: [] },
  });
  const grouped = await kit.content.api.groupDocuments(kit.owner(), {
    collection: 'articles',
    groupBy: { field: 'categories', order: 'asc' },
  });
  expect(
    grouped.rows.map((group) => [group.value, group.documents.rows.map((row) => row.id)]),
  ).toEqual([
    ['blue', [a.id]],
    ['red', [a.id, b.id]],
    [null, [c.id]],
  ]);
  const repeated = await kit.content.api.groupDocuments(kit.owner(), {
    collection: 'articles',
    groupBy: { field: 'items.category', order: 'asc' },
  });
  expect(repeated.rows.map((group) => [group.value, group.documents.total])).toEqual([
    ['One', 1],
    ['Two', 2],
    [null, 1],
  ]);
  const limited = createContent({
    ...kit.contentOptions,
    limits: { ...kit.limits, maxExpandNodes: 2 },
  });
  try {
    await expect(
      limited.api.groupDocuments(kit.owner(), {
        collection: 'articles',
        groupBy: { field: 'categories', order: 'asc' },
      }),
    ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  } finally {
    await limited.close();
  }
});

it('applies source row and field policies before distinct counts and fails unauthorized relationship paths', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.access = {
    'documents.list': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper ? true : { field: 'score', operator: 'ne', value: 99 },
    },
  };
  const score = article.fields.find((field) => field.name === 'score');
  if (!score) throw new Error('Missing score');
  score.access = {
    query: { version: '1', run: ({ actor, locale }) => actor.role.isSuper || locale === 'zh' },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  for (const value of [1, 2, 99])
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: `Score ${value}`, score: value },
    });
  const actor = await contentActor(kit, [
    'articles:documents.list',
    'articles:documents.distinct',
    'articles:documents.groups',
  ]);
  await expect(
    kit.content.api.distinctDocuments(actor.ctx(), {
      collection: 'articles',
      field: 'score',
      order: 'asc',
      locale: 'en',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    await kit.content.api.distinctDocuments(actor.ctx(), {
      collection: 'articles',
      field: 'score',
      order: 'asc',
      locale: 'zh',
    }),
  ).toMatchObject({ rows: [1, 2], total: 2 });
  const empty = await kit.content.api.groupDocuments(actor.ctx(), {
    collection: 'articles',
    groupBy: { field: 'score', order: 'asc' },
    locale: 'zh',
    where: { field: 'title', operator: 'eq', value: 'missing' },
  });
  expect(empty).toMatchObject({ rows: [], total: 0 });
});
