import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(options: Parameters<typeof createContentFixture>[0] = {}) {
  const kit = await createContentFixture(options);
  fixtures.push(kit);
  return kit;
}

it('creates a draft, publishes an immutable view and rejects stale editors', async () => {
  const kit = await fixture();
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Published title', slug: 'first' },
  });
  expect(draft.revision).toBe(1);
  expect(draft.publishedVersionId).toBeNull();
  expect(Object.keys(draft).toSorted()).toEqual(
    [
      'id',
      'collection',
      'revision',
      'versionId',
      'publishedVersionId',
      'trashedAt',
      'folderId',
      'createdAt',
      'updatedAt',
      'createdBy',
      'updatedBy',
      'data',
    ].toSorted(),
  );
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
  });
  expect(published.revision).toBe(2);
  const changed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: published.revision,
    data: { title: 'Editing title' },
  });
  expect(changed.revision).toBe(3);
  expect(changed.data['slug']).toBe('first');
  const view = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    mode: 'published',
  });
  expect(view.data['title']).toBe('Published title');
  const list = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    mode: 'published',
    where: { field: 'title', operator: 'eq', value: 'Published title' },
  });
  expect(list.total).toBe(1);
  expect(list.rows[0]?.data['title']).toBe('Published title');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: published.revision,
      data: { title: 'Stale overwrite' },
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
});

it('keeps missing required fields in drafts but refuses publication', async () => {
  const kit = await fixture();
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { score: 0 },
  });
  expect(draft.data).toEqual({ score: 0 });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: 1,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.createDocument(kit.owner(), { collection: 'pages', data: {} }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('replays only a resource reference and returns its current authorized projection', async () => {
  const kit = await fixture();
  const ctx = kit.owner();
  const input = { collection: 'articles', data: { title: 'Initial' } };
  const first = await kit.content.api.createDocument(ctx, input);
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: 1,
    data: { title: 'Current' },
  });
  const replay = await kit.content.api.createDocument(ctx, input);
  expect(replay.id).toBe(first.id);
  expect(replay.data['title']).toBe('Current');
  await expect(
    kit.content.api.createDocument(ctx, { ...input, data: { title: 'Different' } }),
  ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  const cached = await kit.database.query<{ result: unknown }>(
    "SELECT result FROM idempotency_records WHERE operation_id='documents.create'",
  );
  expect(cached.rows[0]?.result).toEqual({ id: first.id, versionId: first.versionId });
});

it('saves independent locales and restores the entire historical language snapshot', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'English one' },
  });
  const second = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: 1,
    locale: 'zh',
    data: { title: '中文一' },
  });
  const third = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: 2,
    locale: 'en',
    data: { title: 'English two' },
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        locale: 'zh',
      })
    ).data['title'],
  ).toBe('中文一');
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: third.revision,
    versionId: second.versionId,
  });
  expect(restored.versionId).not.toBe(second.versionId);
  expect(restored.data['title']).toBe('English one');
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        locale: 'zh',
      })
    ).data['title'],
  ).toBe('中文一');
});

it('enforces current and published uniqueness without history reserving old values', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A', slug: 'kept' },
  });
  const pub = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 1,
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: pub.revision,
    data: { slug: 'new' },
  });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'B', slug: 'kept' },
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
  await kit.content.api.unpublishDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 3,
  });
  const b = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'B', slug: 'kept' },
  });
  expect(b.data['slug']).toBe('kept');
});

it('supports direct mode history, copies, trash restoration and controlled purge', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Direct one' },
  });
  const next = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: 1,
    data: { title: 'Direct two' },
  });
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: next.revision,
    versionId: first.versionId,
  });
  expect(restored.publishedVersionId).toBe(restored.versionId);
  expect(restored.data['title']).toBe('Direct one');
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: restored.revision,
    data: { title: 'Copy' },
  });
  expect(copy.id).not.toBe(first.id);
  expect(copy.publishedVersionId).toBe(copy.versionId);
  const trashed = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: restored.revision,
  });
  expect(trashed.trashedAt).not.toBeNull();
  expect(trashed.publishedVersionId).toBeNull();
  const duplicate = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: restored.revision,
  });
  expect(duplicate.revision).toBe(trashed.revision);
  const recovered = await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: trashed.revision,
  });
  expect(recovered.trashedAt).toBeNull();
  expect(recovered.publishedVersionId).toBe(recovered.versionId);
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: first.id,
    revision: recovered.revision,
  });
  expect(
    await kit.content.api.purgeDocument(kit.owner(), {
      collection: 'pages',
      id: first.id,
      revision: archived.revision,
    }),
  ).toEqual({ id: first.id, purged: true });
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'pages', id: first.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('rejects version IDs belonging to a different document and unsupported mode operations', async () => {
  const kit = await fixture();
  const one = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'One' },
  });
  const two = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Two' },
  });
  await expect(
    kit.content.api.getVersion(kit.owner(), {
      collection: 'articles',
      id: one.id,
      versionId: two.versionId,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const direct = await kit.content.api.createDocument(kit.owner(), {
    collection: 'settings',
    data: { title: 'Single' },
  });
  await expect(
    kit.content.api.autosaveDocument(kit.owner(), {
      collection: 'settings',
      id: direct.id,
      revision: 1,
      data: { title: 'Draft' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.listVersions(kit.owner(), { collection: 'settings', id: direct.id }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'settings',
      data: { title: 'Second' },
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
});

it('does not archive documents whose current inbound relation is restrictive', async () => {
  const kit = await fixture();
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Target' },
  });
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Source', author: { collection: 'articles', id: target.id } },
  });
  await expect(
    kit.content.api.archiveDocument(kit.owner(), {
      collection: 'articles',
      id: target.id,
      revision: 1,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
});

it('lets one concurrent editor win without overwriting the winning revision', async () => {
  const kit = await fixture();
  const one = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Initial' },
  });
  const results = await Promise.allSettled(
    ['One', 'Two'].map((title) =>
      kit.content.api.updateDocument(kit.owner(), {
        collection: 'articles',
        id: one.id,
        revision: 1,
        data: { title },
      }),
    ),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const rejected = results.find((result) => result.status === 'rejected');
  expect(rejected).toMatchObject({ reason: { code: 'version_conflict' } });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: one.id }))
      .revision,
  ).toBe(2);
});

it('rolls back content when an extension rejects the change', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Article definition missing');
  article.hooks = {
    beforeChange: [
      {
        version: 'validate-title-1',
        run: ({ data }) => {
          if (data['title'] === 'Reject') throw new Error('Rejected title');
          return data;
        },
      },
    ],
  };
  const kit = await fixture({ collections });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Reject' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    0,
  );
});
