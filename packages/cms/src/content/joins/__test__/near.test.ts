import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

it('preserves the Payload planar near sort instead of advertising an unrelated custom Join order', async () => {
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
        orderable: true,
        where: { or: [{ field: 'location', operator: 'near', value: [0, 80, 100000, null] }] },
      },
    },
  ];
  const pages = contentCollection(collections, 'pages');
  pages.fields = [
    ...pages.fields,
    {
      id: 'location',
      name: 'location',
      type: 'point',
      access: {
        read: { version: '1', run: ({ actor }) => actor.role.isSuper },
        query: { version: '1', run: ({ actor }) => actor.role.isSuper },
      },
    },
  ];
  const kit = await createContentFixture({ collections });
  try {
    const parent = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Parent' },
    });
    const east = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: {
        title: 'First inserted',
        location: [1, 80],
        author: { collection: 'articles', id: parent.id },
      },
    });
    const south = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: {
        title: 'Second inserted',
        location: [0, 79.5],
        author: { collection: 'articles', id: parent.id },
      },
    });
    const result = await kit.content.api.getJoinedDocuments(kit.owner(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      depth: 0,
      count: true,
    });
    expect(result.rows).toEqual([
      { collection: 'pages', id: south.id },
      { collection: 'pages', id: east.id },
    ]);
    expect(result.sort).toEqual([]);
    expect(result.total).toBe(2);
    const actor = await contentActor(kit, [
      'articles:documents.join',
      'articles:documents.get',
      'pages:documents.get',
    ]);
    const hidden = await kit.content.api.getJoinedDocuments(actor.ctx(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      depth: 0,
    });
    expect(hidden.rows).toEqual([
      { collection: 'pages', id: east.id },
      { collection: 'pages', id: south.id },
    ]);
    expect(hidden.sort).toEqual([]);
  } finally {
    await kit.close();
  }
});
