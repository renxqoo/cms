import { contentActor } from '../../../../../test/support/content-actor.ts';
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

it('reports truthful partial batch results and never overwrites a conflicting document', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A' },
  });
  const b = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'B' },
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: b.id,
    revision: 1,
    data: { title: 'B current' },
  });
  const result = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: [
      { id: a.id, revision: 1, data: { title: 'A updated' } },
      { id: b.id, revision: 1, data: { title: 'B stale' } },
    ],
  });
  expect(result).toMatchObject({
    status: 'partial',
    total: 2,
    succeeded: 1,
    failed: 1,
    items: [
      { id: a.id, status: 'succeeded' },
      { id: b.id, status: 'failed', error: { code: 'version_conflict' } },
    ],
  });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: b.id })).data[
      'title'
    ],
  ).toBe('B current');
});

it('persists an asynchronous batch, resumes it on maintenance and replays the same job', async () => {
  const kit = await fixture({ maxSyncBatchItems: 1 });
  const documents = await Promise.all(
    ['A', 'B'].map((title) =>
      kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title } }),
    ),
  );
  const input = {
    collection: 'articles',
    action: 'archive',
    items: documents.map((document) => ({ id: document.id, revision: 1 })),
  };
  const ctx = kit.owner();
  const accepted = await kit.content.api.createBatch(ctx, input);
  expect(accepted).toMatchObject({ status: 'queued' });
  if (!('jobId' in accepted)) throw new Error('Async job expected');
  await kit.content.maintenance();
  const job = await kit.content.api.getJob(kit.owner(), {
    collection: 'articles',
    jobId: accepted.jobId,
  });
  expect(job).toMatchObject({ status: 'succeeded', succeeded: 2, failed: 0 });
  const replay = await kit.content.api.createBatch(ctx, input);
  expect(replay).toMatchObject({ jobId: accepted.jobId });
});

it('publishes exactly the scheduled revision and fails an obsolete schedule', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Scheduled' },
  });
  const scheduled = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 1,
    versionId: a.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    scheduled.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: scheduled.jobId }),
  ).toMatchObject({ status: 'succeeded', succeeded: 1 });
  const pub = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    mode: 'published',
  });
  expect(pub.versionId).toBe(a.versionId);
  const later = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: pub.revision,
    versionId: a.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: pub.revision,
    data: { title: 'New draft' },
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    later.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: later.jobId }),
  ).toMatchObject({
    status: 'failed',
    failed: 1,
    items: [{ status: 'failed', error: { code: 'version_conflict' } }],
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: a.id,
        mode: 'published',
      })
    ).data['title'],
  ).toBe('Scheduled');
});

it('returns terminal failures after retry exhaustion instead of leaving items queued forever', async () => {
  const kit = await fixture({ maxSyncBatchItems: 1 });
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A' },
  });
  const b = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'B' },
  });
  const accepted = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'archive',
    items: [a, b].map((document) => ({ id: document.id, revision: 1 })),
  });
  if (!('jobId' in accepted)) throw new Error('Async job expected');
  await kit.database.query('UPDATE content_jobs SET attempts=3 WHERE id=$1', [accepted.jobId]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: accepted.jobId }),
  ).toMatchObject({
    status: 'failed',
    total: 2,
    failed: 2,
    items: [
      { status: 'failed', error: { code: 'temporarily_unavailable' } },
      { status: 'failed', error: { code: 'temporarily_unavailable' } },
    ],
  });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: a.id }))
      .trashedAt,
  ).toBeNull();
});

it('cancels a schedule atomically and cannot publish its cancelled version', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Scheduled' },
  });
  const job = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: a.id,
    revision: 1,
    versionId: a.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  });
  await kit.content.api.cancelPublicationSchedule(kit.owner(), {
    collection: 'articles',
    id: a.id,
    scheduleId: job.jobId,
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    job.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.jobId }),
  ).toMatchObject({ status: 'cancelled', items: [{ status: 'cancelled' }] });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: a.id,
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('persists extension intent with the revision and invokes a registered post-commit handler', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Article definition missing');
  article.extensions = [{ id: 'notify', version: '1', afterCommit: 'notify' }];
  const seen: string[] = [];
  const kit = await fixture({
    collections,
    afterCommitHandlers: {
      notify: ({ revisionId }) => {
        seen.push(revisionId);
        return Promise.resolve();
      },
    },
  });
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Notify' },
  });
  expect(seen).toEqual([]);
  await kit.content.maintenance();
  expect(seen).toEqual([a.versionId]);
  await kit.content.maintenance();
  expect(seen).toEqual([a.versionId]);
});

it('replays an asynchronous job with its current terminal state and filters hidden failed items from statistics', async () => {
  const collections = workflowCollections();
  const [articles] = collections;
  if (!articles) throw new Error('Articles missing');
  articles.access = {
    'documents.get': {
      version: '1',
      run: ({ actor }) => actor.role.isSuper || { field: 'score', operator: 'gte', value: 10 },
    },
  };
  const kit = await fixture({ collections, maxSyncBatchItems: 1 });
  const visible = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Visible', score: 10 },
  });
  const hidden = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Hidden', score: 1 },
  });
  const ctx = kit.owner();
  const input = {
    collection: 'articles',
    action: 'update',
    items: [
      { id: visible.id, revision: 1, data: { title: 'Updated' } },
      { id: hidden.id, revision: 99, data: { title: 'Stale hidden' } },
    ],
  };
  const accepted = await kit.content.api.createBatch(ctx, input);
  if (!('jobId' in accepted)) throw new Error('Async job missing');
  await kit.content.maintenance();
  expect(await kit.content.api.createBatch(ctx, input)).toMatchObject({
    jobId: accepted.jobId,
    status: 'partial',
  });
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:content.batch',
    'articles:content.getJob',
  ]);
  expect(
    await kit.content.api.getJob(editor.ctx(), { collection: 'articles', jobId: accepted.jobId }),
  ).toMatchObject({
    status: 'succeeded',
    total: 1,
    succeeded: 1,
    failed: 0,
    items: [{ id: visible.id, status: 'succeeded' }],
  });
});

it('persists a unique-conflict copy failure without a phantom document and executes archive and restore batches', async () => {
  const kit = await fixture();
  const a = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A', slug: 'a' },
  });
  const b = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'B', slug: 'b' },
  });
  const copied = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'copy',
    items: [
      { id: a.id, revision: a.revision, data: { slug: 'copy-a' } },
      { id: b.id, revision: b.revision, data: { slug: 'a' } },
    ],
  });
  expect(copied).toMatchObject({
    status: 'partial',
    succeeded: 1,
    failed: 1,
    items: [{ status: 'succeeded' }, { status: 'failed', error: { code: 'identifier_taken' } }],
  });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    3,
  );
  const archived = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'archive',
    items: [
      { id: a.id, revision: 1 },
      { id: b.id, revision: 1 },
    ],
  });
  expect(archived).toMatchObject({ status: 'succeeded', succeeded: 2 });
  expect(
    (await kit.content.api.listDocuments(kit.owner(), { collection: 'articles', trashed: true }))
      .total,
  ).toBe(2);
  const restored = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'restoreTrash',
    items: [
      { id: a.id, revision: 2 },
      { id: b.id, revision: 2 },
    ],
  });
  expect(restored).toMatchObject({ status: 'succeeded', succeeded: 2 });
  expect(
    (await kit.content.api.listDocuments(kit.owner(), { collection: 'articles', trashed: true }))
      .total,
  ).toBe(0);
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    3,
  );
});
