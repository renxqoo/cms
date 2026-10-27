import { afterEach, expect, it } from 'vitest';
import { createContent } from '../composition.ts';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
  contentField,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition, ContentLimits } from '../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(collections: CollectionDefinition[], limits: Partial<ContentLimits> = {}) {
  const kit = await createContentFixture({
    collections,
    compose(options) {
      const configured = { ...options, limits: { ...options.limits, ...limits } };
      const content = createContent(configured);
      return { content, options: configured, close: () => content.close() };
    },
  });
  fixtures.push(kit);
  return kit;
}

it('regression: async permissions agree across document reads, history, expansion, metadata, editor, filters and writes', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  let permitWrite = true;
  contentField(articles, 'score').access = {
    read: { version: 'hidden', run: () => Promise.resolve(false) },
    write: { version: 'write', run: () => Promise.resolve(permitWrite) },
  };
  articles.access = {
    'documents.get': {
      version: 'read',
      run: async () => Promise.resolve({ field: 'title', operator: 'eq', value: 'Allowed' }),
    },
  };
  contentCollection(collections, 'settings').access = {
    'collections.get': { version: 'hidden', run: () => Promise.resolve(false) },
  };
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Allowed', score: 7 },
  });
  const carrier = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Carrier', author: { collection: 'articles', id: document.id } },
  });
  const read = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
  });
  const listed = await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' });
  const historical = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: document.id,
    versionId: document.versionId,
  });
  for (const view of [document, read, listed.rows[0], historical])
    expect(view?.data).not.toHaveProperty('score');
  const expanded = await kit.content.api.getDocument(kit.owner(), {
    collection: 'pages',
    id: carrier.id,
    depth: 1,
  });
  expect(expanded.data['author']).toMatchObject({ id: document.id, data: { title: 'Allowed' } });
  expect(expanded.data['author']).not.toHaveProperty('data.score');
  const collection = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(collection.fields.map((field) => field.path)).not.toContain('score');
  const discovery = await kit.content.api.listCollections(kit.owner(), {});
  expect(discovery.rows.map((item) => item.key)).toEqual(['articles', 'pages']);
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: document.id,
    intent: 'update',
  });
  expect(editor.layout.map((field) => field.path)).not.toContain('score');
  await expect(
    kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'score', operator: 'eq', value: 7 },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  permitWrite = false;
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      data: { score: 8 },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: document.revision,
    data: { slug: 'allowed' },
  });
  expect(updated.revision).toBe(document.revision + 1);
  const denied = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Denied' },
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: denied.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('regression: async field write receives the actual target id and frozen stable block context', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'section',
          key: 'section',
          label: 'Section',
          fields: [
            { id: 'enabled', name: 'enabled', type: 'boolean' },
            {
              id: 'text',
              name: 'text',
              type: 'text',
              access: {
                write: {
                  version: 'row',
                  run: (context) =>
                    Promise.resolve(
                      context.operation === 'documents.create' ||
                        (typeof context.documentId === 'string' &&
                          context.path?.endsWith('.text') === true &&
                          context.siblingData?.['enabled'] === true &&
                          context.blockData?.['blockType'] === 'section' &&
                          Object.isFrozen(context.previousData) &&
                          Object.isFrozen(context.nextData)),
                    ),
                },
              },
            },
          ],
        },
      ],
    },
  ];
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Nested',
      blocks: [
        {
          id: '10000000-0000-4000-8000-000000000003',
          blockType: 'section',
          enabled: true,
          text: 'Old',
        },
      ],
    },
  });
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: document.revision,
    data: {
      blocks: [
        {
          id: '10000000-0000-4000-8000-000000000003',
          blockType: 'section',
          enabled: true,
          text: 'New',
        },
      ],
    },
  });
  expect(updated.data['blocks']).toEqual([
    {
      id: '10000000-0000-4000-8000-000000000003',
      blockType: 'section',
      enabled: true,
      text: 'New',
    },
  ]);
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: updated.revision,
      data: {
        blocks: [
          {
            id: '10000000-0000-4000-8000-000000000003',
            blockType: 'section',
            enabled: false,
            text: 'Denied',
          },
        ],
      },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('regression: a timed out async collection policy releases its transaction and permits the next operation', async () => {
  const collections = workflowCollections();
  let blocked = true;
  let cancelled = 0;
  contentCollection(collections, 'articles').access = {
    'documents.create': {
      version: 'wait',
      run: ({ signal }) => {
        if (!blocked) return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
          signal?.addEventListener(
            'abort',
            () => {
              cancelled += 1;
              resolve(false);
            },
            { once: true },
          );
        });
      },
    },
  };
  const kit = await fixture(collections, { maxHookDurationMs: 30 });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Timeout' },
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(cancelled).toBe(1);
  blocked = false;
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'After timeout' },
  });
  expect(created.revision).toBe(1);
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    1,
  );
});

it('regression: cancellation interrupts async field access and releases the read transaction', async () => {
  const collections = workflowCollections();
  let blocked = false;
  let observed: AbortSignal | undefined;
  const entered = Promise.withResolvers<void>();
  contentField(contentCollection(collections, 'articles'), 'title').access = {
    read: {
      version: 'wait',
      run: ({ signal }) => {
        if (!blocked) return Promise.resolve(true);
        observed = signal;
        entered.resolve();
        return new Promise<boolean>((resolve) => {
          signal?.addEventListener('abort', () => resolve(false), { once: true });
        });
      },
    },
  };
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible' },
  });
  blocked = true;
  const controller = new AbortController();
  const running = kit.content.api.getDocument(
    { ...kit.owner(), signal: controller.signal },
    { collection: 'articles', id: document.id },
  );
  const outcome = running.catch((error: unknown) => error);
  await entered.promise;
  controller.abort();
  expect(await outcome).toMatchObject({ code: 'temporarily_unavailable' });
  expect(observed?.aborted).toBe(true);
  blocked = false;
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }))
      .data['title'],
  ).toBe('Visible');
});
