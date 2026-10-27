import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { createContent } from '../../composition.ts';
import type { CollectionDefinition } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(configure?: (collections: CollectionDefinition[]) => void) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    {
      id: 'joined',
      name: 'joined',
      type: 'join',
      join: {
        collection: 'pages',
        field: 'author',
        defaultPageSize: 2,
        defaultSort: [{ field: 'title', order: 'asc' }],
      },
    },
  ];
  configure?.(collections);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}
async function source(kit: ContentFixture, title = 'Source') {
  return kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title } });
}
async function target(kit: ContentFixture, id: string, title: string | Record<string, unknown>) {
  return kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: {
      ...(typeof title === 'string' ? { title } : title),
      author: { collection: 'articles', id },
    },
  });
}
function read(kit: ContentFixture, id: string, query: Record<string, unknown> = {}) {
  return kit.content.api.getJoinedDocuments(kit.owner(), {
    collection: 'articles',
    id,
    fieldId: 'joined',
    ...query,
  });
}

it('paginates inverse joins before population and counts only requested matches without legacy array values', async () => {
  const kit = await fixture();
  const parent = await source(kit);
  const other = await source(kit, 'Other');
  const c = await target(kit, parent.id, 'Charlie');
  const a = await target(kit, parent.id, 'Alpha');
  const b = await target(kit, parent.id, 'Bravo');
  await target(kit, other.id, 'Outside');
  const first = await read(kit, parent.id, { count: true });
  expect(first).toMatchObject({
    page: 1,
    pageSize: 2,
    hasNextPage: true,
    total: 3,
    sort: [{ field: 'title', order: 'asc' }],
    rows: [
      { id: a.id, data: { title: 'Alpha' } },
      { id: b.id, data: { title: 'Bravo' } },
    ],
  });
  expect(await read(kit, parent.id, { page: 2, depth: 0 })).toEqual({
    rows: [{ collection: 'pages', id: c.id }],
    page: 2,
    pageSize: 2,
    hasNextPage: false,
    sort: [{ field: 'title', order: 'asc' }],
  });
  expect(await read(kit, parent.id, { page: 5, count: true })).toMatchObject({
    rows: [],
    total: 3,
    hasNextPage: false,
  });
  expect(
    await read(kit, parent.id, {
      where: { field: 'title', operator: 'like', value: 'a' },
      sort: [{ field: 'title', order: 'desc' }],
      pageSize: 1,
      count: true,
      depth: 0,
    }),
  ).toMatchObject({ rows: [{ id: c.id }], total: 3, hasNextPage: true });
  const embedded = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: parent.id,
    depth: 0,
    joins: { joined: { page: 2, pageSize: 2, count: true } },
  });
  expect(embedded.data['joined']).toEqual({
    rows: [{ collection: 'pages', id: c.id }],
    page: 2,
    pageSize: 2,
    hasNextPage: false,
    total: 3,
    sort: [{ field: 'title', order: 'asc' }],
  });
  const disabled = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: parent.id,
    joins: false,
  });
  expect(disabled.data).not.toHaveProperty('joined');
  const selected = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: parent.id,
    select: ['title'],
  });
  expect(selected.data).toEqual({ title: 'Source' });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: parent.id,
    intent: 'update',
  });
  expect(editor.layout.find((node) => node.id === 'joined')?.constraints.join).toEqual({
    collections: ['pages'],
    orderable: false,
    defaultPageSize: 2,
    maxPageSize: kit.limits.maxPageSize,
  });
  await expect(
    read(kit, parent.id, { pageSize: kit.limits.maxPageSize + 1 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: parent.id,
      joins: { missing: { page: 1 } },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('unions multiple collections before a shared sort and page, retaining independent source groups and empty counts', async () => {
  const kit = await fixture((collections) => {
    const settings = contentCollection(collections, 'settings');
    settings.singleton = false;
    settings.fields = [
      ...settings.fields,
      { id: 'author', name: 'author', type: 'relationship', relationTo: ['articles'] },
    ];
    const join = contentCollection(collections, 'articles').fields.find(
      (field) => field.id === 'joined',
    );
    if (!join?.join) throw new Error('Missing join');
    join.join = { ...join.join, collection: ['pages', 'settings'] };
  });
  const one = await source(kit, 'One');
  const two = await source(kit, 'Two');
  const empty = await source(kit, 'Empty');
  const d = await target(kit, one.id, 'Delta');
  const b = await target(kit, one.id, 'Bravo');
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'settings',
    data: { title: 'Alpha', author: { collection: 'articles', id: one.id } },
  });
  const c = await target(kit, two.id, 'Charlie');
  expect(await read(kit, one.id, { pageSize: 1, page: 2, count: true, depth: 0 })).toMatchObject({
    rows: [{ collection: 'pages', id: b.id }],
    total: 3,
    hasNextPage: true,
  });
  expect(await read(kit, one.id, { pageSize: 1, page: 1, count: true, depth: 1 })).toMatchObject({
    rows: [{ collection: 'settings', id: a.id, data: { title: 'Alpha' } }],
    total: 3,
  });
  const listed = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    sort: [{ field: 'title', order: 'asc' }],
    joins: { joined: { count: true, pageSize: 1 } },
    depth: 0,
  });
  expect(listed.rows.map((row) => row.data['joined'])).toEqual([
    {
      rows: [],
      page: 1,
      pageSize: 1,
      total: 0,
      hasNextPage: false,
      sort: [{ field: 'title', order: 'asc' }],
    },
    {
      rows: [{ collection: 'settings', id: a.id }],
      page: 1,
      pageSize: 1,
      total: 3,
      hasNextPage: true,
      sort: [{ field: 'title', order: 'asc' }],
    },
    {
      rows: [{ collection: 'pages', id: c.id }],
      page: 1,
      pageSize: 1,
      total: 1,
      hasNextPage: false,
      sort: [{ field: 'title', order: 'asc' }],
    },
  ]);
  expect(
    (await read(kit, one.id, { sort: [{ field: 'title', order: 'desc' }], depth: 0 })).rows[0],
  ).toEqual({ collection: 'pages', id: d.id });
  expect(await read(kit, empty.id, { count: false })).not.toHaveProperty('total');
});

it('enforces source and field access plus target policies before filters, pagination and totals', async () => {
  const kit = await fixture((collections) => {
    const pages = contentCollection(collections, 'pages');
    pages.fields = [
      ...pages.fields,
      {
        id: 'secret',
        name: 'secret',
        type: 'text',
        access: {
          read: { version: '1', run: ({ actor }) => actor.role.isSuper },
          query: { version: '1', run: ({ actor }) => actor.role.isSuper },
        },
      },
    ];
    pages.access = {
      'documents.get': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Hidden' },
      },
    };
    const articles = contentCollection(collections, 'articles');
    const join = articles.fields.find((field) => field.id === 'joined');
    if (!join?.join) throw new Error('Missing join');
    join.join = { ...join.join, where: { field: 'secret', operator: 'eq', value: 'eligible' } };
    articles.access = {
      'documents.join': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Private' },
      },
    };
  });
  const parent = await source(kit);
  const privateSource = await source(kit, 'Private');
  const a = await target(kit, parent.id, { title: 'Alpha', secret: 'eligible' });
  await target(kit, parent.id, { title: 'Hidden', secret: 'eligible' });
  await target(kit, parent.id, { title: 'Filtered', secret: 'other' });
  const actor = await contentActor(kit, [
    'articles:documents.join',
    'articles:documents.get',
    'pages:documents.get',
  ]);
  const result = await kit.content.api.getJoinedDocuments(actor.ctx(), {
    collection: 'articles',
    id: parent.id,
    fieldId: 'joined',
    count: true,
  });
  expect(result).toMatchObject({ rows: [{ id: a.id, data: { title: 'Alpha' } }], total: 1 });
  expect(JSON.stringify(result)).not.toContain('eligible');
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      where: { field: 'secret', operator: 'eq', value: 'eligible' },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      sort: [{ field: 'secret', order: 'asc' }],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: privateSource.id,
      fieldId: 'joined',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: ['articles:documents.join', 'articles:documents.get'].map((key) =>
      kit.permissionIds.get(key),
    ),
  });
  expect(
    await kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      count: true,
    }),
  ).toEqual({ rows: [], page: 1, pageSize: 2, hasNextPage: false, total: 0, sort: [] });
});

it('uses shared independent Join ordering with CAS, stable base ordering and append-only new positions', async () => {
  const kit = await fixture((collections) => {
    const article = contentCollection(collections, 'articles');
    const join = article.fields.find((field) => field.id === 'joined');
    if (!join?.join) throw new Error('Missing join');
    join.join = { collection: 'pages', field: 'author', orderable: true, defaultPageSize: 10 };
    const pages = contentCollection(collections, 'pages');
    pages.orderable = true;
    delete pages.defaultSort;
  });
  const parent = await source(kit);
  const a = await target(kit, parent.id, 'Alpha');
  const b = await target(kit, parent.id, 'Bravo');
  const c = await target(kit, parent.id, 'Charlie');
  const initial = await read(kit, parent.id, { depth: 0 });
  expect(initial.rows.map((row) => row['id'])).toEqual([a.id, b.id, c.id]);
  expect(initial.orderVersion).toMatch(/^[0-9a-f-]{36}$/);
  expect(
    (
      await kit.database.query(
        "SELECT count(*)::int AS count FROM content_order_control WHERE scope_key<>''",
      )
    ).rows,
  ).toEqual([{ count: 0 }]);
  const move = {
    collection: 'articles',
    id: parent.id,
    fieldId: 'joined',
    version: initial.orderVersion,
    ids: [c.id],
    targetId: a.id,
    position: 'before',
  };
  const concurrent = await Promise.allSettled([
    kit.content.api.reorderJoinedDocuments(kit.owner(), move),
    kit.content.api.reorderJoinedDocuments(kit.owner(), { ...move, ids: [b.id] }),
  ]);
  expect(concurrent.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
  expect(concurrent.find((entry) => entry.status === 'rejected')).toMatchObject({
    reason: { code: 'version_conflict' },
  });
  const current = await read(kit, parent.id, { depth: 0 });
  expect(current.orderVersion).not.toBe(initial.orderVersion);
  const base = await kit.content.api.listDocuments(kit.owner(), { collection: 'pages', depth: 0 });
  expect(base.rows.map((row) => row.id)).toEqual([a.id, b.id, c.id]);
  const d = await target(kit, parent.id, 'Delta');
  expect((await read(kit, parent.id, { depth: 0 })).rows.at(-1)).toEqual({
    collection: 'pages',
    id: d.id,
  });
  await expect(
    kit.content.api.reorderJoinedDocuments(kit.owner(), { ...move, version: current.orderVersion }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const latest = await read(kit, parent.id, { depth: 0 });
  const bounded = createContent({
    ...kit.contentOptions,
    workPolicy: { ...kit.contentOptions.workPolicy, maxOrderKeyBytes: 1 },
  });
  await expect(
    bounded.api.reorderJoinedDocuments(kit.owner(), {
      ...move,
      version: latest.orderVersion,
      ids: [d.id],
      targetId: a.id,
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  expect((await read(kit, parent.id, { depth: 0 })).orderVersion).toBe(latest.orderVersion);
  await bounded.close();
});
