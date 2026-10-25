import type { Where } from '../../definition.ts';
import type { ContentOptions } from '@new-cms/cms/content/composition';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createContent } from '@new-cms/cms/content/composition';
import type { Database, SqlExecutor } from '@new-cms/database/client';
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

function counted(database: Database, measurement: { active: boolean; queries: number }): Database {
  return {
    ...database,
    transaction(work, signal) {
      return database.transaction((tx) => {
        const executor: SqlExecutor = {
          query(text, values) {
            if (measurement.active) measurement.queries += 1;
            return tx.query(text, values);
          },
        };
        return work(executor);
      }, signal);
    },
  };
}

it('discovers hundreds of persisted jobs within the same request SQL budget instead of querying each historical job', async () => {
  const measurement = { active: false, queries: 0 };
  const kit = await createContentFixture({
    compose(options) {
      const configured = { ...options, database: counted(options.database, measurement) };
      return {
        content: createContent(configured),
        options: configured,
        close: () => Promise.resolve(),
      };
    },
  });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'A bounded discovery history' },
  });
  const result = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: [{ id: target.id, revision: 1, data: { score: 1 } }],
  });
  if (!('id' in result)) throw new Error('Expected synchronous job');
  const ids = Array.from({ length: 150 }, () => randomUUID());
  await kit.database.query(
    `INSERT INTO content_jobs(id,collection_id,collection_key,action,actor_id,source_operation,execute_at) SELECT seed.id,j.collection_id,j.collection_key,'batch',j.actor_id,'content.batch',clock_timestamp() FROM unnest($1::uuid[]) seed(id) CROSS JOIN content_jobs j WHERE j.id=$2`,
    [ids, result.id],
  );
  await kit.database.query(
    `INSERT INTO content_job_items(job_id,position,document_id,expected_revision,payload) SELECT id,0,$2,2,'{"action":"update","locale":"en","data":{"score":3}}'::jsonb FROM unnest($1::uuid[]) id`,
    [ids, target.id],
  );
  measurement.active = true;
  const page = await kit.content.api.listJobs(kit.owner(), { collection: 'articles', pageSize: 2 });
  measurement.active = false;
  expect(page.total).toBe(151);
  expect(page.rows).toHaveLength(2);
  expect(measurement.queries).toBeLessThanOrEqual(kit.limits.maxSqlQueries);
});

it('evaluates item write predicates in their stored locale while preserving the read view locale', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').access = {
    'documents.update': {
      version: 'locale-writes',
      run: (context) => ({
        field: 'title',
        operator: 'eq',
        value: context.locale === 'zh' ? '可见' : 'English',
      }),
    },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: { en: { title: 'English' }, zh: { title: '可见' } },
  });
  const result = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    locale: 'zh',
    items: [{ id: target.id, revision: 1, data: { score: 2 } }],
  });
  if (!('id' in result)) throw new Error('Expected synchronous job');
  expect(await kit.content.api.listJobs(kit.owner(), { collection: 'articles' })).toMatchObject({
    total: 1,
    rows: [{ id: result.id, status: 'succeeded' }],
  });
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: result.id }),
  ).toMatchObject({ total: 1, status: 'succeeded' });
  await expect(
    kit.content.api.listJobs(kit.owner(), { collection: 'articles', pageSize: 101 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.listJobs(kit.owner(), { collection: 'articles', unexpected: true }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it.each(['over-depth', 'cyclic'] as const)(
  'rejects %s list predicates before serializing policy cache keys',
  async (symptom) => {
    const collections = workflowCollections();
    let predicate: Where = {
      field: 'title',
      operator: 'eq',
      value: 'A visible task',
    };
    if (symptom === 'over-depth')
      for (let depth = 0; depth < 8; depth += 1) predicate = { and: [predicate] };
    else {
      const cyclic: { and: Where[] } = { and: [] };
      cyclic.and.push(cyclic);
      predicate = cyclic;
    }
    contentCollection(collections, 'articles').access = {
      'content.listJobs': { version: 'bad-budget-policy', run: () => predicate },
    };
    const kit = await createContentFixture({ collections });
    fixtures.push(kit);
    const target = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'A visible task' },
    });
    await kit.content.api.createBatch(kit.owner(), {
      collection: 'articles',
      action: 'update',
      items: [{ id: target.id, revision: 1, data: { score: 1 } }],
    });
    await expect(
      kit.content.api.listJobs(kit.owner(), { collection: 'articles' }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  },
);

it('does not authorize unrelated collections for nonrelation job list or detail predicates', async () => {
  const observed = { enabled: false, unrelated: 0 };
  const kit = await createContentFixture({
    compose(options) {
      const configured: ContentOptions = {
        ...options,
        authorize(...args) {
          if (
            observed.enabled &&
            args[2] === 'documents.get' &&
            args[3]?.collectionKey !== 'articles'
          )
            observed.unrelated += 1;
          return options.authorize(...args);
        },
      };
      return {
        content: createContent(configured),
        options: configured,
        close: () => Promise.resolve(),
      };
    },
  });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Only this collection' },
  });
  const job = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: [{ id: target.id, revision: 1, data: { score: 1 } }],
  });
  if (!('id' in job)) throw new Error('Expected synchronous job');
  observed.enabled = true;
  expect(await kit.content.api.listJobs(kit.owner(), { collection: 'articles' })).toMatchObject({
    total: 1,
  });
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.id }),
  ).toMatchObject({ total: 1 });
  observed.enabled = false;
  expect(observed.unrelated).toBe(0);
});
