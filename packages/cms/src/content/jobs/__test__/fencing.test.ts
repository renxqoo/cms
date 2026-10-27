import { prepareHierarchyNode } from '../../documents/project-data.ts';
import { relationScopes } from '../../documents/relation-scopes.ts';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createContent } from '../../composition.ts';
import { createContentStore } from '../../adapters/postgres/store.ts';
import { contentInputSchemas } from '../../input-schemas.ts';
import { executeJobItem } from '../execute-item.ts';
import type { JobRow, JobItemRow } from '../store.ts';
import { collectionPredicate } from '../../runtime.ts';
import type { ContentRuntime } from '../../types.ts';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(options: Parameters<typeof createContentFixture>[0] = {}) {
  const kit = await createContentFixture(options);
  fixtures.push(kit);
  return kit;
}
async function schedule(kit: ContentFixture) {
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Scheduled' },
  });
  const job = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: doc.id,
    revision: 1,
    versionId: doc.versionId,
    executeAt: new Date(Date.now() + 60000).toISOString(),
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    job.jobId,
  ]);
  return { doc, job };
}

it('lets two instances claim a publication once and records one business outcome', async () => {
  const kit = await fixture();
  const second = createContent(kit.contentOptions);
  try {
    const { doc, job } = await schedule(kit);
    await Promise.all([kit.content.maintenance(), second.maintenance()]);
    expect(
      await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.jobId }),
    ).toMatchObject({ status: 'succeeded', succeeded: 1 });
    const published = await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: doc.id,
      mode: 'published',
    });
    expect(published.revision).toBe(2);
    const audit = await kit.database.query<{ total: string }>(
      "SELECT count(*) AS total FROM audit_events WHERE operation_id='documents.publish' AND target_id=$1",
      [doc.id],
    );
    expect(audit.rows[0]?.total).toBe('1');
  } finally {
    await second.close();
  }
});

it('rolls back publication and audit when the lease is invalidated before the item result commits', async () => {
  const kit = await fixture();
  const { doc, job } = await schedule(kit);
  await kit.database.query(
    `CREATE FUNCTION expire_publication_lease() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE content_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE document_id=NEW.document_id AND status='running'; RETURN NEW; END; $$; CREATE TRIGGER expire_publication_lease BEFORE INSERT OR UPDATE ON content_publications FOR EACH ROW EXECUTE FUNCTION expire_publication_lease()`,
  );
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.jobId }),
  ).toMatchObject({
    status: 'failed',
    items: [{ status: 'failed', error: { code: 'version_conflict' } }],
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: doc.id,
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const audit = await kit.database.query<{ total: string }>(
    "SELECT count(*) AS total FROM audit_events WHERE operation_id='documents.publish' AND target_id=$1",
    [doc.id],
  );
  expect(audit.rows[0]?.total).toBe('0');
});

it('does not let a stale copy claim create duplicate documents after a newer generation completes', async () => {
  const kit = await fixture({ maxSyncBatchItems: 1 });
  const documents = await Promise.all(
    ['A', 'B'].map((title) =>
      kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title } }),
    ),
  );
  const accepted = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'copy',
    items: documents.map((doc) => ({ id: doc.id, revision: 1 })),
  });
  if (!('jobId' in accepted)) throw new Error('Async job missing');
  const claim = await kit.database.query<JobRow>(
    "UPDATE content_jobs SET status='running',owner=$2,generation=1,attempts=1,lease_until=clock_timestamp()-interval '1 second' WHERE id=$1 RETURNING *",
    [accepted.jobId, randomUUID()],
  );
  const [old] = claim.rows;
  const items = await kit.database.query<JobItemRow>(
    'SELECT * FROM content_job_items WHERE job_id=$1 ORDER BY position',
    [accepted.jobId],
  );
  const [item] = items.rows;
  if (!old || !item) throw new Error('Claim missing');
  await kit.content.maintenance();
  const runtime: ContentRuntime = {
    prepareHierarchyNode: (state, input) => prepareHierarchyNode(state, { ...input, runtime }),
    ...kit.contentOptions,
    evaluateCollectionPolicy: collectionPredicate,
    resolveRelationScopes: (state) => relationScopes(state, runtime),
    resolveCollection: (_tx, key) => Promise.resolve(kit.registry.get(key)),
    store: createContentStore({ mapping: kit.artifacts.mapping, limits: kit.limits }),
    schemas: contentInputSchemas({
      ...kit.limits,
      maxBatchItems: kit.contentOptions.workPolicy.maxBatchItems,
      maxSyncBatchItems: kit.contentOptions.workPolicy.maxSyncBatchItems,
    }),
  };
  await expect(executeJobItem(runtime, { job: old, item })).rejects.toMatchObject({
    code: 'version_conflict',
  });
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: accepted.jobId }),
  ).toMatchObject({ status: 'succeeded' });
  expect((await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total).toBe(
    4,
  );
  const stored = await kit.database.query<{ generation: number }>(
    'SELECT generation FROM content_jobs WHERE id=$1',
    [accepted.jobId],
  );
  expect(stored.rows[0]?.generation).toBe(2);
});

it('stops waiting on an interrupted handler and does not claim new work after stop', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Article missing');
  article.extensions = [{ id: 'blocked', version: '1', afterCommit: 'blocked' }];
  let entered = false;
  const kit = await fixture({
    collections,
    afterCommitHandlers: {
      blocked: () => {
        entered = true;
        return new Promise<void>(() => {});
      },
    },
  });
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Blocked' },
  });
  const running = kit.content.maintenance();
  await vi.waitFor(() => {
    expect(entered).toBe(true);
  });
  kit.content.stop();
  await kit.content.close();
  await running;
  await kit.content.maintenance();
  const state = await kit.database.query<{ status: string; attempts: number }>(
    'SELECT status,attempts FROM content_jobs',
  );
  expect(state.rows).toEqual([{ status: 'running', attempts: 1 }]);
});

async function shortLeaseWorker(kit: ContentFixture) {
  const { createDatabase } = await import('@new-cms/database/client');
  const database = createDatabase({
    connectionString: kit.connectionString,
    schema: kit.schema,
    maxConnections: 4,
    statementTimeoutMs: 700,
    lockTimeoutMs: 200,
    connectionTimeoutMs: 1000,
  });
  const content = createContent({
    ...kit.contentOptions,
    database,
    policy: { ...kit.policy, statementTimeoutMs: 700, lockTimeoutMs: 200, requestTimeoutMs: 2000 },
    workPolicy: { ...kit.contentOptions.workPolicy, jobLeaseMs: 1000 },
  });
  return {
    content,
    close: async () => {
      await content.close();
      await database.close();
    },
  };
}

it('does not start a lease or consume an attempt for a job waiting behind a gated handler', async () => {
  let started = false;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Articles missing');
  article.extensions = [{ id: 'gated', version: '1', afterCommit: 'deliver' }];
  let calls = 0;
  const kit = await fixture({
    collections,
    afterCommitHandlers: {
      deliver: async () => {
        calls += 1;
        if (calls === 1) {
          started = true;
          await gate;
        }
      },
    },
  });
  for (const title of ['First', 'Waiting'])
    await kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title } });
  const worker = await shortLeaseWorker(kit);
  const running = worker.content.maintenance();
  try {
    await vi.waitFor(() => {
      expect(started).toBe(true);
    });
    const jobs = await kit.database.query<{ status: string; attempts: number }>(
      "SELECT status,attempts FROM content_jobs WHERE action='extension' ORDER BY execute_at,id",
    );
    expect(jobs.rows).toEqual([
      { status: 'running', attempts: 1 },
      { status: 'queued', attempts: 0 },
    ]);
  } finally {
    release?.();
    await running;
    await worker.close();
  }
});

it('renews a live owner lease between healthy items whose combined SQL duration exceeds one lease', async () => {
  const kit = await fixture({ maxSyncBatchItems: 1 });
  const docs = [];
  for (const title of ['A', 'B', 'C', 'D'])
    docs.push(
      await kit.content.api.createDocument(kit.owner(), {
        collection: 'articles',
        data: { title },
      }),
    );
  const accepted = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: docs.map((doc) => ({ id: doc.id, revision: doc.revision, data: { title: 'Updated' } })),
  });
  if (!('jobId' in accepted)) throw new Error('Async job missing');
  await kit.database.query(
    'CREATE FUNCTION slow_content_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END; $$; CREATE TRIGGER slow_content_item BEFORE UPDATE OF current_version_id ON content_documents FOR EACH ROW EXECUTE FUNCTION slow_content_item()',
  );
  const worker = await shortLeaseWorker(kit);
  try {
    await worker.content.maintenance();
    expect(
      await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: accepted.jobId }),
    ).toMatchObject({ status: 'succeeded', succeeded: 4, failed: 0 });
    const attempts = await kit.database.query<{ attempts: number; generation: number }>(
      'SELECT attempts,generation FROM content_jobs WHERE id=$1',
      [accepted.jobId],
    );
    expect(attempts.rows).toEqual([{ attempts: 1, generation: 1 }]);
  } finally {
    await worker.close();
  }
});
