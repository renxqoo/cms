import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { createContent } from '../../composition.ts';

async function fixture(orderable = false) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields,
    {
      id: 'joined',
      name: 'joined',
      type: 'join',
      join: { collection: 'pages', field: 'author', orderable },
    },
  ];
  return createContentFixture({ collections });
}

it('reads published inverse pages under explicit language fallback and rejects unpublished source identities', async () => {
  const kit = await fixture();
  try {
    const parent = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Parent' },
    });
    await expect(
      kit.content.api.getJoinedDocuments(kit.owner(), {
        collection: 'articles',
        id: parent.id,
        fieldId: 'joined',
        mode: 'published',
      }),
    ).rejects.toMatchObject({ code: 'not_found' });
    const child = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Child', author: { collection: 'articles', id: parent.id } },
    });
    await kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: parent.id,
      revision: parent.revision,
    });
    const page = await kit.content.api.getJoinedDocuments(kit.owner(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      mode: 'published',
      locale: 'zh',
      fallback: [],
      depth: 0,
    });
    expect(page).toEqual({
      rows: [{ collection: 'pages', id: child.id }],
      page: 1,
      pageSize: kit.limits.defaultPageSize,
      hasNextPage: false,
      sort: [{ field: 'updatedAt', order: 'desc' }],
    });
    const another = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Another', author: { collection: 'articles', id: parent.id } },
    });
    await expect(
      kit.content.api.reorderJoinedDocuments(kit.owner(), {
        collection: 'articles',
        id: parent.id,
        fieldId: 'joined',
        version: randomUUID(),
        ids: [child.id],
        targetId: another.id,
        position: 'after',
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  } finally {
    await kit.close();
  }
});

it('fails closed on missing order controls and enforces serialized joined response byte budgets', async () => {
  const kit = await fixture(true);
  try {
    const parent = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Parent' },
    });
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'x'.repeat(3000), author: { collection: 'articles', id: parent.id } },
    });
    const limited = createContent({
      ...kit.contentOptions,
      limits: { ...kit.limits, maxResponseBytes: 2000 },
    });
    try {
      await expect(
        limited.api.getDocument(kit.owner(), {
          collection: 'articles',
          id: parent.id,
          joins: false,
        }),
      ).resolves.toMatchObject({ id: parent.id });
      await expect(
        limited.api.getJoinedDocuments(kit.owner(), {
          collection: 'articles',
          id: parent.id,
          fieldId: 'joined',
        }),
      ).rejects.toMatchObject({ code: 'capacity_exceeded' });
    } finally {
      await limited.close();
    }
    const before = await kit.content.api.getJoinedDocuments(kit.owner(), {
      collection: 'articles',
      id: parent.id,
      fieldId: 'joined',
      depth: 0,
    });
    expect(before.orderVersion).toMatch(/^[0-9a-f-]{36}$/);
    await kit.database.query(
      "DELETE FROM content_order_control WHERE collection_id='workflow_pages' AND scope_key=''",
    );
    await expect(
      kit.content.api.getJoinedDocuments(kit.owner(), {
        collection: 'articles',
        id: parent.id,
        fieldId: 'joined',
      }),
    ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    await expect(kit.content.verifyReady()).rejects.toMatchObject({
      code: 'temporarily_unavailable',
    });
  } finally {
    await kit.close();
  }
});
