import { afterEach, expect, it } from 'vitest';
import { createContent } from '../../composition.ts';
import { compileContent, createRegistry } from '../../generate.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import { contentOperations } from '../../operations.ts';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(flags: Partial<CollectionDefinition> = {}, maxSyncBatchItems = 20) {
  const collections = workflowCollections();
  Object.assign(contentCollection(collections, 'articles'), flags);
  const kit = await createContentFixture({ collections, maxSyncBatchItems });
  fixtures.push(kit);
  return kit;
}
function configured(kit: ContentFixture, flags: Partial<CollectionDefinition>) {
  const collections = workflowCollections();
  Object.assign(contentCollection(collections, 'articles'), flags);
  const registry = createRegistry({
    collections,
    limits: kit.limits,
    operations: [...contentOperations, ...assetsOperations],
  });
  return createContent({ ...kit.contentOptions, registry, mapping: compileContent(registry) });
}
it('reports disabled actions, rejects every bulk entry and preserves authorized single document edits and trash operations', async () => {
  const kit = await fixture({
    disableBulkEdit: true,
    disableBulkDelete: true,
    disableDuplicate: true,
  });
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata).toMatchObject({
    disableBulkEdit: true,
    disableBulkDelete: true,
    disableDuplicate: true,
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source' },
  });
  for (const action of ['update', 'copy', 'archive', 'restoreTrash']) {
    await expect(
      kit.content.api.createBatch(kit.owner(), {
        collection: 'articles',
        action,
        items: [
          {
            id: source.id,
            revision: source.revision,
            ...(action === 'update' ? { data: { title: 'Batch' } } : {}),
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  }
  await expect(
    kit.content.api.copyDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: 1,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    kit.content.api.getEditor(kit.owner(), {
      collection: 'articles',
      id: source.id,
      intent: 'copy',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const editor = await kit.content.api.getEditor(kit.owner(), {
    collection: 'articles',
    id: source.id,
    intent: 'update',
  });
  expect(editor.actions.find((action) => action.operationId === 'documents.copy')?.state).toBe(
    'denied',
  );
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    data: { title: 'Single update' },
  });
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: updated.revision,
  });
  const restored = await kit.content.api.restoreTrashedDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: archived.revision,
  });
  expect(restored.data['title']).toBe('Single update');
  expect(restored.trashedAt).toBeNull();
});
it.each([
  ['disableBulkEdit', 'update', 'archive'],
  ['disableBulkDelete', 'archive', 'update'],
  ['disableDuplicate', 'copy', 'update'],
] as const)('enforces %s independently when accepting batches', async (flag, disabled, enabled) => {
  const kit = await fixture({ [flag]: true });
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  const item = { id: doc.id, revision: 1 };
  const itemFor = (action: string) => ({
    ...item,
    ...(action === 'update' ? { data: { title: 'Permitted batch' } } : {}),
  });
  await expect(
    kit.content.api.createBatch(kit.owner(), {
      collection: 'articles',
      action: disabled,
      items: [itemFor(disabled)],
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const result = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: enabled,
    items: [itemFor(enabled)],
  });
  expect(result).toMatchObject({ status: 'succeeded', succeeded: 1, failed: 0 });
});
it.each([
  ['disableBulkEdit', 'update'],
  ['disableBulkDelete', 'archive'],
  ['disableDuplicate', 'copy'],
] as const)(
  'rechecks %s for queued work and idempotent replay after configuration changes',
  async (flag, action) => {
    const kit = await fixture({}, 1);
    const docs = [];
    for (const title of ['First', 'Second'])
      docs.push(
        await kit.content.api.createDocument(kit.owner(), {
          collection: 'articles',
          data: { title },
        }),
      );
    const context = kit.owner();
    const input = {
      collection: 'articles',
      action,
      items: docs.map((doc) => ({
        id: doc.id,
        revision: 1,
        ...(action === 'update' ? { data: { title: 'Forbidden queued update' } } : {}),
      })),
    };
    const accepted = await kit.content.api.createBatch(context, input);
    if (!('jobId' in accepted)) throw new Error('Expected persistent batch');
    const next = configured(kit, { [flag]: true });
    try {
      await expect(next.api.createBatch(context, input)).rejects.toMatchObject({
        code: 'forbidden',
      });
      await next.maintenance();
      const job = await next.api.getJob(kit.owner(), {
        collection: 'articles',
        jobId: accepted.jobId,
      });
      expect(job).toMatchObject({
        status: 'failed',
        succeeded: 0,
        failed: 2,
        items: [{ error: { code: 'forbidden' } }, { error: { code: 'forbidden' } }],
      });
      const rows = await next.api.listDocuments(kit.owner(), { collection: 'articles' });
      expect(rows.total).toBe(2);
      expect(rows.rows.map((row) => row.data['title'])).toEqual(
        expect.arrayContaining(['First', 'Second']),
      );
    } finally {
      await next.close();
    }
  },
);
it('retains all versions with a zero maximum through writes and maintenance', async () => {
  const kit = await fixture({ history: { maxVersions: 0, retentionMs: 0 } });
  let current = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Original' },
  });
  const original = current.versionId;
  for (const title of ['Second', 'Third', 'Fourth', 'Fifth'])
    current = await kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: current.id,
      revision: current.revision,
      data: { title },
    });
  await kit.content.maintenance();
  const history = await kit.content.api.listVersions(kit.owner(), {
    collection: 'articles',
    id: current.id,
  });
  expect(history.total).toBe(5);
  const oldest = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: current.id,
    versionId: original,
  });
  expect(oldest.data['title']).toBe('Original');
});
