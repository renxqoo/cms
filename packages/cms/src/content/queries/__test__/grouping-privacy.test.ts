import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

it('regression: query-only grants cannot enumerate read-denied field values through distinct or group APIs', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: {
        read: { version: '1', run: ({ actor }) => actor.role.isSuper },
        query: { version: '1', run: () => true },
      },
    },
  ];
  const kit = await createContentFixture({ collections });
  try {
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Visible', secret: 'CLASSIFIED' },
    });
    const actor = await contentActor(kit, [
      'articles:documents.list',
      'articles:documents.groups',
      'articles:documents.distinct',
    ]);
    await expect(
      kit.content.api.listDocuments(actor.ctx(), {
        collection: 'articles',
        where: { field: 'secret', operator: 'eq', value: 'CLASSIFIED' },
      }),
    ).resolves.toMatchObject({ total: 1, rows: [{ data: { title: 'Visible' } }] });
    await expect(
      kit.content.api.distinctDocuments(actor.ctx(), {
        collection: 'articles',
        field: 'secret',
        order: 'asc',
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
    await expect(
      kit.content.api.groupDocuments(actor.ctx(), {
        collection: 'articles',
        groupBy: { field: 'secret', order: 'asc' },
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  } finally {
    await kit.close();
  }
});
