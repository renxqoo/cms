import { randomUUID } from 'node:crypto';
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
async function fixture(configure: (collections: CollectionDefinition[]) => void) {
  const collections = workflowCollections();
  configure(collections);
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('regression: projected and transformed data cannot reveal Join fields behind raw ancestor and leaf policies', async () => {
  const kit = await fixture((collections) => {
    const article = contentCollection(collections, 'articles');
    const join = { collection: 'pages', field: 'author', defaultPageSize: 1 };
    article.fields = [
      ...article.fields,
      { id: 'visible', name: 'visible', type: 'boolean' },
      {
        id: 'group',
        name: 'group',
        type: 'group',
        access: {
          read: {
            version: '1',
            run: ({ data, actor }) => actor.role.isSuper || data?.['visible'] === true,
          },
        },
        fields: [{ id: 'joined', name: 'joined', type: 'join', join }],
      },
      {
        id: 'rows',
        name: 'rows',
        type: 'array',
        fields: [{ id: 'row_join', name: 'joined', type: 'join', join }],
      },
      {
        id: 'empty',
        name: 'empty',
        type: 'group',
        fields: [{ id: 'empty_join', name: 'joined', type: 'join', join }],
      },
      {
        id: 'secret_join',
        name: 'secret',
        type: 'join',
        join,
        access: { read: { version: '1', run: ({ actor }) => actor.role.isSuper } },
      },
    ];
    article.hooks = {
      afterRead: [{ version: 'change-view', run: ({ data }) => ({ ...data, visible: true }) }],
    };
  });
  const parent = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Parent', visible: false, rows: [{ id: randomUUID() }, { id: randomUUID() }] },
  });
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Child', author: { collection: 'articles', id: parent.id } },
  });
  const actor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.join',
    'pages:documents.get',
  ]);
  const view = await kit.content.api.getDocument(actor.ctx(), {
    collection: 'articles',
    id: parent.id,
    depth: 0,
  });
  expect(view.data).not.toHaveProperty('group');
  expect(view.data).not.toHaveProperty('secret');
  expect(view.data['empty']).toMatchObject({
    joined: { rows: [{ id: target.id }], hasNextPage: false },
  });
  expect(view.data['rows']).toMatchObject([
    { joined: { rows: [{ id: target.id }] } },
    { joined: { rows: [{ id: target.id }] } },
  ]);
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'secret_join',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const disabled = await kit.content.api.getDocument(actor.ctx(), {
    collection: 'articles',
    id: parent.id,
    depth: 0,
    joins: { 'rows.joined': false, 'empty.joined': false },
  });
  expect(JSON.stringify(disabled.data)).not.toContain(target.id);
  const bounded = createContent({
    ...kit.contentOptions,
    limits: { ...kit.limits, maxExpandNodes: 2 },
  });
  await expect(
    bounded.api.getDocument(actor.ctx(), { collection: 'articles', id: parent.id, depth: 0 }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  await bounded.close();
});

it('preserves maxDepth and defaultPopulate with locale fallback and safe configured default sorting', async () => {
  const kit = await fixture((collections) => {
    const article = contentCollection(collections, 'articles');
    article.fields = [
      ...article.fields,
      {
        id: 'joined',
        name: 'joined',
        type: 'join',
        maxDepth: 0,
        join: {
          collection: 'pages',
          field: 'author',
          defaultSort: [{ field: 'secret', order: 'asc' }],
        },
      },
      {
        id: 'populated',
        name: 'populated',
        type: 'join',
        join: { collection: 'pages', field: 'author' },
      },
    ];
    const pages = contentCollection(collections, 'pages');
    pages.defaultPopulate = ['title'];
    pages.fields = pages.fields.map((field) =>
      field.name === 'title' ? { ...field, localized: true } : field,
    );
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
  });
  const parent = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Parent' },
  });
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: {
      title: 'Fallback',
      secret: 'HIDDEN',
      author: { collection: 'articles', id: parent.id },
    },
  });
  const actor = await contentActor(kit, [
    'articles:documents.join',
    'articles:documents.get',
    'pages:documents.get',
  ]);
  const result = await kit.content.api.getJoinedDocuments(actor.ctx(), {
    collection: 'articles',
    id: parent.id,
    fieldId: 'joined',
    locale: 'zh',
    depth: 3,
    count: true,
  });
  expect(result).toMatchObject({
    rows: [{ collection: 'pages', id: target.id }],
    total: 1,
    sort: [],
  });
  expect(JSON.stringify(result)).not.toContain('secret');
  const populated = await kit.content.api.getJoinedDocuments(kit.owner(), {
    collection: 'articles',
    id: parent.id,
    fieldId: 'populated',
    locale: 'zh',
    depth: 1,
  });
  expect(populated.rows[0]?.['data']).toEqual({ title: 'Fallback' });
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      depth: kit.limits.maxExpandDepth + 1,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const empty = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Archived' },
  });
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: empty.id,
    revision: empty.revision,
  });
  await expect(
    kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: archived.id,
      fieldId: 'joined',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('rejects nonmember and hidden reorder targets, source-field denial and missing update grants without changing the Join token', async () => {
  const kit = await fixture((collections) => {
    const article = contentCollection(collections, 'articles');
    article.fields = [
      ...article.fields,
      {
        id: 'joined',
        name: 'joined',
        type: 'join',
        join: { collection: 'pages', field: 'author', orderable: true },
      },
    ];
    const pages = contentCollection(collections, 'pages');
    pages.access = {
      'documents.get': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Hidden' },
      },
      'documents.update': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Locked' },
      },
      'documents.reorder': {
        version: '1',
        run: ({ actor }) =>
          actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Pinned' },
      },
    };
  });
  const parent = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Parent' },
  });
  const other = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Other' },
  });
  const rows = [];
  for (const title of ['Alpha', 'Bravo', 'Hidden', 'Locked', 'Pinned', 'Outside'])
    rows.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'pages',
        data: {
          title,
          author: { collection: 'articles', id: title === 'Outside' ? other.id : parent.id },
        },
      }),
    );
  const [a, b, hidden, locked, pinned, outside] = rows;
  if (!a || !b || !hidden || !locked || !pinned || !outside) throw new Error('Missing rows');
  const grants = [
    'articles:documents.reorderJoin',
    'articles:documents.join',
    'articles:documents.get',
    'pages:documents.get',
    'pages:documents.list',
    'pages:documents.reorder',
    'pages:documents.update',
  ];
  const actor = await contentActor(kit, grants);
  const page = await kit.content.api.getJoinedDocuments(actor.ctx(), {
    collection: 'articles',
    id: parent.id,
    fieldId: 'joined',
  });
  const input = {
    collection: 'articles',
    id: parent.id,
    fieldId: 'joined',
    version: page.orderVersion,
    ids: [a.id],
    targetId: b.id,
    position: 'before',
  };
  for (const id of [hidden.id, locked.id, pinned.id, outside.id])
    await expect(
      kit.content.api.reorderJoinedDocuments(actor.ctx(), { ...input, ids: [id] }),
    ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.reorderJoinedDocuments(actor.ctx(), { ...input, targetId: outside.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(
    (
      await kit.content.api.getJoinedDocuments(actor.ctx(), {
        collection: 'articles',
        id: parent.id,
        fieldId: 'joined',
      })
    ).orderVersion,
  ).toBe(page.orderVersion);
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: grants
      .filter((key) => key !== 'pages:documents.update')
      .map((key) => kit.permissionIds.get(key)),
  });
  await expect(kit.content.api.reorderJoinedDocuments(actor.ctx(), input)).rejects.toMatchObject({
    code: 'forbidden',
  });
});
