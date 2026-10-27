import { afterEach, expect, it } from 'vitest';
import { createContent } from '../composition.ts';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition } from '../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture(
  collections: CollectionDefinition[],
  limits: Partial<ContentFixture['limits']> = {},
) {
  const kit = await createContentFixture({
    collections,
    trashRetentionMs: 0,
    compose(options) {
      const configured = { ...options, limits: { ...options.limits, ...limits } };
      const content = createContent(configured);
      return { content, options: configured, close: () => content.close() };
    },
  });
  fixtures.push(kit);
  return kit;
}

it('awaits async defaults, validation and hooks while publishing the exact immutable saved snapshot', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.drafts = { ...articles.drafts, validate: true };
  articles.localizeStatus = true;
  let transforms = 0;
  const observations: unknown[] = [];
  articles.fields = [
    ...articles.fields,
    {
      id: 'generated',
      name: 'generated',
      type: 'text',
      defaultValue: {
        version: 'actor-locale',
        run: ({ locale, actor, signal }) =>
          Promise.resolve(signal && actor ? `${actor.email}:${locale}` : 'missing'),
      },
      validate: {
        version: 'suffix',
        run: (value) => Promise.resolve(typeof value === 'string' && value.endsWith(':zh')),
      },
    },
  ];
  articles.hooks = {
    beforeChange: [
      {
        version: 'non-idempotent',
        run: async ({ data }) => {
          await Promise.resolve();
          transforms += 1;
          return { ...data, title: `${typeof data['title'] === 'string' ? data['title'] : ''}!` };
        },
      },
    ],
    beforePublish: [
      {
        version: 'snapshot',
        run: ({ data, operation, locale }) => {
          observations.push({ title: data?.['title'], operation, locale });
          return Promise.resolve();
        },
      },
    ],
  };
  const kit = await fixture(collections);
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    data: { title: '标题' },
  });
  expect(created.data).toMatchObject({
    title: '标题!',
    generated: 'content-owner@example.test:zh',
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    id: created.id,
    revision: created.revision,
  });
  expect(published.versionId).toBe(created.versionId);
  expect(transforms).toBe(1);
  expect(observations).toEqual([{ title: '标题!', operation: 'documents.publish', locale: 'zh' }]);
});

it('async validation rejection rolls back a candidate before documents, audit and revisions are committed', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.drafts = { ...articles.drafts, validate: true };
  articles.fields = articles.fields.map((field) =>
    field.name === 'title'
      ? { ...field, validate: { version: 'async-reject', run: () => Promise.resolve(false) } }
      : field,
  );
  const kit = await fixture(collections);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Rejected' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await kit.database.query('SELECT 1 FROM content_documents')).rowCount).toBe(0);
  expect((await kit.database.query('SELECT 1 FROM content_revisions')).rowCount).toBe(0);
});

it('regression: a never-resolving hook times out and releases its transaction lock for the next write', async () => {
  const collections = workflowCollections();
  let blocked = true;
  let cancelled = false;
  contentCollection(collections, 'articles').hooks = {
    beforeChange: [
      {
        version: 'bounded',
        run: ({ data, signal }) => {
          if (!blocked) return data;
          signal?.addEventListener(
            'abort',
            () => {
              cancelled = true;
            },
            { once: true },
          );
          return new Promise(() => {});
        },
      },
    ],
  };
  const kit = await fixture(collections, { maxHookDurationMs: 30 });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Timed out' },
    }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(cancelled).toBe(true);
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

it('regression: cancelling a waiting async hook aborts the hook signal and releases the transaction', async () => {
  const collections = workflowCollections();
  const entered = Promise.withResolvers<void>();
  let blocked = true;
  let hookSignal: AbortSignal | undefined;
  contentCollection(collections, 'articles').hooks = {
    beforeChange: [
      {
        version: 'cancel',
        run: ({ data, signal }) => {
          if (!blocked) return data;
          hookSignal = signal;
          entered.resolve();
          return new Promise(() => {});
        },
      },
    ],
  };
  const kit = await fixture(collections);
  const controller = new AbortController();
  const running = kit.content.api.createDocument(
    { ...kit.owner(), signal: controller.signal },
    { collection: 'articles', data: { title: 'Cancelled' } },
  );
  const outcome = running.catch((error: unknown) => error);
  await entered.promise;
  controller.abort();
  expect(await outcome).toMatchObject({ code: 'temporarily_unavailable' });
  expect(hookSignal?.aborted).toBe(true);
  blocked = false;
  expect(
    (
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title: 'Next request' },
      })
    ).revision,
  ).toBe(1);
});

it('regression: afterRead cannot change a policy flag to reveal a previously unreadable field', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'enabled', name: 'enabled', type: 'boolean' },
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: { read: { version: 'flag', run: ({ data }) => data?.['enabled'] === true } },
    },
  ];
  articles.hooks = {
    afterRead: [
      { version: 'change-flag', run: ({ data }) => Promise.resolve({ ...data, enabled: true }) },
    ],
  };
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible', enabled: false, secret: 'Private' },
  });
  expect(document.data['enabled']).toBe(true);
  expect(document.data).not.toHaveProperty('secret');
  const read = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
  });
  expect(read.data).not.toHaveProperty('secret');
});

it('archive and purge await delete hooks and roll back an archive rejected by afterDelete', async () => {
  const collections = workflowCollections();
  const observations: unknown[] = [];
  let rejectArchive = true;
  contentCollection(collections, 'articles').hooks = {
    beforeDelete: [
      {
        version: 'before',
        run: ({ documentId, data, operation }) => {
          observations.push({ stage: 'before', documentId, title: data?.['title'], operation });
          return Promise.resolve();
        },
      },
    ],
    afterDelete: [
      {
        version: 'after',
        run: ({ operation }) => {
          if (rejectArchive && operation === 'documents.archive')
            return Promise.reject(new Error('reject'));
          observations.push({ stage: 'after', operation });
          return Promise.resolve();
        },
      },
    ],
  };
  const kit = await fixture(collections);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Deleted' },
  });
  await expect(
    kit.content.api.archiveDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: 1,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }))
      .trashedAt,
  ).toBeNull();
  rejectArchive = false;
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: 1,
  });
  await kit.content.api.purgeDocument(kit.owner(), {
    collection: 'articles',
    id: document.id,
    revision: archived.revision,
  });
  expect(observations).toContainEqual({
    stage: 'before',
    documentId: document.id,
    title: 'Deleted',
    operation: 'documents.purge',
  });
  expect(observations).toContainEqual({ stage: 'after', operation: 'documents.purge' });
  expect(
    (await kit.database.query('SELECT 1 FROM content_documents WHERE id=$1', [document.id]))
      .rowCount,
  ).toBe(0);
});
