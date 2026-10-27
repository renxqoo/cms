import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

it('applies target row policies before relationship groups, labels, linked virtuals and counts without reclassifying hidden targets as null', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    { id: 'page_title', name: 'pageTitle', type: 'text', hasMany: true, virtual: 'related.title' },
  ];
  const pages = contentCollection(collections, 'pages');
  pages.admin = { useAsTitle: 'title' };
  pages.access = {
    'documents.get': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Hidden' },
    },
  };
  const kit = await createContentFixture({ collections });
  try {
    const visible = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Visible page' },
    });
    const hidden = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Hidden' },
    });
    const docs = [];
    for (const [title, refs] of [
      ['Both', [visible.id, hidden.id]],
      ['Hidden only', [hidden.id]],
      ['Empty', []],
    ] as const)
      docs.push(
        await kit.content.api.createDocument(kit.owner(), {
          collection: 'articles',
          data: { title, related: refs.map((id) => ({ collection: 'pages', id })) },
        }),
      );
    const actor = await contentActor(kit, [
      'articles:documents.list',
      'articles:documents.groups',
      'articles:documents.distinct',
      'pages:documents.get',
    ]);
    const result = await kit.content.api.groupDocuments(actor.ctx(), {
      collection: 'articles',
      groupBy: { field: 'related', order: 'asc' },
      depth: 0,
    });
    expect(
      result.rows.map((group) => ({
        value: group.value,
        label: group.label,
        ids: group.documents.rows.map((row) => row.id),
      })),
    ).toEqual([
      { value: { collection: 'pages', id: visible.id }, label: 'Visible page', ids: [docs[0]?.id] },
      { value: null, label: undefined, ids: [docs[2]?.id] },
    ]);
    for (const field of ['related.title', 'pageTitle']) {
      const grouped = await kit.content.api.groupDocuments(actor.ctx(), {
        collection: 'articles',
        groupBy: { field, order: 'asc' },
      });
      expect(grouped.rows.map((group) => [group.value, group.documents.total])).toEqual([
        ['Visible page', 1],
        [null, 1],
      ]);
    }
    const preset = await kit.content.api.createQueryPreset(kit.owner(), {
      collection: 'articles',
      name: 'Related titles',
      query: { columns: ['title'], sort: [], q: '', groupBy: { field: 'pageTitle', order: 'asc' } },
    });
    expect(preset.query.groupBy).toEqual({ field: 'pageTitle', order: 'asc' });
  } finally {
    await kit.close();
  }
});

it('rejects target query-only values even when the relationship itself is readable', async () => {
  const collections = workflowCollections();
  const page = contentCollection(collections, 'pages');
  page.fields = [
    ...page.fields,
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: {
        query: { version: '1', run: () => true },
        read: { version: '1', run: ({ actor }) => actor.role.isSuper },
      },
    },
  ];
  const kit = await createContentFixture({ collections });
  try {
    const target = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Public', secret: 'Private' },
    });
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Source', related: [{ collection: 'pages', id: target.id }] },
    });
    const actor = await contentActor(kit, [
      'articles:documents.list',
      'articles:documents.distinct',
      'pages:documents.get',
    ]);
    await expect(
      kit.content.api.distinctDocuments(actor.ctx(), {
        collection: 'articles',
        field: 'related.secret',
        order: 'asc',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  } finally {
    await kit.close();
  }
});
