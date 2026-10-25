import { afterEach, expect, it } from 'vitest';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import {
  createContentFixture,
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const resource of fixtures.splice(0).toReversed()) await resource.close();
});
async function fixture(options: Parameters<typeof createContentFixture>[0] = {}) {
  const result = await createContentFixture(options);
  fixtures.push(result);
  return result;
}
async function document(kit: ContentFixture, title: string) {
  return kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title } });
}
async function batch(kit: ContentFixture, target: { id: string; revision: number }) {
  return kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: [{ id: target.id, revision: target.revision, data: { score: 7 } }],
  });
}

it('discovers persisted publication schedules and retains the requested version after cancellation', async () => {
  const kit = await fixture();
  const target = await document(kit, 'A planned publication');
  const schedule = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: target.id,
    revision: target.revision,
    versionId: target.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  });
  const input = {
    collection: 'articles',
    action: 'publication',
    documentId: target.id,
    pageSize: 1,
  };
  expect(await kit.content.api.listJobs(kit.owner(), input)).toMatchObject({
    total: 1,
    rows: [
      {
        kind: 'content',
        id: schedule.jobId,
        documentId: target.id,
        expectedRevision: 1,
        requestedVersionId: target.versionId,
        status: 'queued',
      },
    ],
  });
  await kit.content.api.cancelPublicationSchedule(kit.owner(), {
    collection: 'articles',
    id: target.id,
    scheduleId: schedule.jobId,
  });
  expect(
    await kit.content.api.listJobs(kit.owner(), { ...input, status: 'cancelled' }),
  ).toMatchObject({
    total: 1,
    rows: [{ id: schedule.jobId, requestedVersionId: target.versionId }],
  });
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: schedule.jobId }),
  ).toMatchObject({ requestedVersionId: target.versionId });
  expect(await kit.content.api.listJobs(kit.owner(), { ...input, page: 2 })).toMatchObject({
    rows: [],
    total: 1,
    page: 2,
    pageSize: 1,
  });
});

it('filters hidden job prefixes before pagination and computes status from visible batch items', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').access = {
    'documents.get': {
      version: 'visibility-v1',
      run: () => ({ field: 'title', operator: 'eq', value: 'Visible' }),
    },
  };
  const kit = await fixture({ collections });
  const visible = await document(kit, 'Visible');
  const hidden = await document(kit, 'Hidden');
  const mixed = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: [
      { id: visible.id, revision: 1, data: { score: 1 } },
      { id: hidden.id, revision: 99, data: { score: 2 } },
    ],
  });
  for (let index = 0; index < 7; index += 1)
    await expect(batch(kit, { id: hidden.id, revision: 1 })).rejects.toMatchObject({
      code: 'not_found',
    });
  const page = await kit.content.api.listJobs(kit.owner(), {
    collection: 'articles',
    pageSize: 1,
    status: 'succeeded',
  });
  if (!('id' in mixed)) throw new Error('Expected synchronous job');
  expect(page).toMatchObject({
    total: 1,
    rows: [
      { kind: 'content', id: mixed.id, status: 'succeeded', total: 1, succeeded: 1, failed: 0 },
    ],
  });
  expect(
    await kit.content.api.listJobs(kit.owner(), { collection: 'articles', status: 'partial' }),
  ).toMatchObject({ total: 0, rows: [] });
  expect(
    await kit.content.api.listJobs(kit.owner(), { collection: 'articles', documentId: hidden.id }),
  ).toMatchObject({ total: 0, rows: [] });
});

it('applies the new list Where and current source permissions to a nonowner before total and rows', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').access = {
    'content.listJobs': {
      version: 'list-only',
      run: () => ({ field: 'score', operator: 'gte', value: 5 }),
    },
  };
  const kit = await fixture({ collections });
  const target = await document(kit, 'Visible to another editor');
  await batch(kit, target);
  const viewer = await contentActor(kit, [
    'articles:content.listJobs',
    'articles:content.getJob',
    'articles:content.batch',
    'articles:documents.get',
    'articles:documents.update',
  ]);
  expect(await kit.content.api.listJobs(viewer.ctx(), { collection: 'articles' })).toMatchObject({
    total: 1,
  });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: viewer.role.id,
    version: viewer.role.version,
    permissionIds: [
      kit.permissionIds.get('articles:content.listJobs'),
      kit.permissionIds.get('articles:content.getJob'),
    ].filter((id): id is string => id !== undefined),
  });
  expect(await kit.content.api.listJobs(viewer.ctx(), { collection: 'articles' })).toMatchObject({
    total: 0,
    rows: [],
  });
});

it('job details and discovery honor relation policy scopes instead of failing an otherwise visible task', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').access = {
    'content.getJob': {
      version: 'relation-v1',
      run: () => ({ field: 'related.title', operator: 'eq', value: 'Public target' }),
    },
  };
  const kit = await fixture({ collections });
  const related = await document(kit, 'Public target');
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', related: [{ collection: 'articles', id: related.id }] },
  });
  const accepted = await batch(kit, target);
  if (!('id' in accepted)) throw new Error('Expected synchronous job');
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: accepted.id }),
  ).toMatchObject({ total: 1, status: 'succeeded' });
  expect(await kit.content.api.listJobs(kit.owner(), { collection: 'articles' })).toMatchObject({
    total: 1,
    rows: [{ id: accepted.id }],
  });
});

it('extension discovery and details share relation-scoped target eligibility without exposing hidden extensions', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.extensions = [{ id: 'notify', version: 'v1', afterCommit: 'notify' }];
  articles.access = {
    'content.getJob': {
      version: 'extension-reader',
      run: () => ({ field: 'related.title', operator: 'eq', value: 'Public target' }),
    },
  };
  const kit = await fixture({
    collections,
    afterCommitHandlers: { notify: () => Promise.resolve() },
  });
  const target = await document(kit, 'Public target');
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Extension source', related: [{ collection: 'articles', id: target.id }] },
  });
  const page = await kit.content.api.listJobs(kit.owner(), {
    collection: 'articles',
    action: 'extension',
  });
  expect(page).toMatchObject({ total: 1, rows: [{ documentId: source.id, action: 'extension' }] });
  const hidden = await kit.database.query<{ id: string }>(
    "SELECT id FROM content_jobs WHERE action='extension' AND document_id=$1",
    [target.id],
  );
  const [hiddenJob] = hidden.rows;
  if (!hiddenJob) throw new Error('Expected hidden extension fixture');
  await expect(
    kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: hiddenJob.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const [job] = page.rows;
  if (!job) throw new Error('Expected visible extension');
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.id }),
  ).toMatchObject({ documentId: source.id, action: 'extension', total: 0 });
});

it('a copy job matches source-only discovery predicates while its readable result remains independently visible', async () => {
  const collections = workflowCollections();
  const sourcePredicate = {
    version: 'source-title',
    run: () => ({ field: 'title', operator: 'eq' as const, value: 'Source' }),
  };
  contentCollection(collections, 'articles').access = {
    'content.listJobs': sourcePredicate,
    'content.getJob': sourcePredicate,
  };
  const kit = await fixture({ collections });
  const source = await document(kit, 'Source');
  const job = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'copy',
    items: [{ id: source.id, revision: 1, data: { title: 'A readable copy' } }],
  });
  if (!('id' in job)) throw new Error('Expected synchronous job');
  const [copied] = job.items;
  if (!copied?.resultId) throw new Error('Expected copied result');
  expect(
    await kit.content.api.listJobs(kit.owner(), {
      collection: 'articles',
      documentId: copied.resultId,
    }),
  ).toMatchObject({ total: 1, rows: [{ id: job.id, succeeded: 1 }] });
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.id }),
  ).toMatchObject({ succeeded: 1, items: [{ id: source.id, resultId: copied.resultId }] });
});
