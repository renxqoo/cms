import { afterEach, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture(permit: () => boolean) {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.access = {
    'documents.create': { version: 'chinese', run: ({ locale }) => permit() && locale === 'zh' },
  };
  articles.extensions = [{ id: 'notify', version: '1', afterCommit: 'notify' }];
  const received: unknown[] = [];
  const kit = await createContentFixture({
    collections,
    afterCommitHandlers: {
      notify: (input) => {
        received.push(input);
        return Promise.resolve();
      },
    },
  });
  fixtures.push(kit);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    data: { title: '中文任务' },
  });
  return { kit, document, received };
}

it('regression: afterCommit reauthorizes and delivers a Chinese-only source operation using its persisted locale', async () => {
  const { kit, document, received } = await fixture(() => true);
  await kit.content.maintenance();
  expect(received).toEqual([
    expect.objectContaining({
      collection: 'articles',
      documentId: document.id,
      revisionId: document.versionId,
      locale: 'zh',
    }),
  ]);
  expect(
    (await kit.database.query("SELECT status FROM content_jobs WHERE action='extension'")).rows,
  ).toEqual([{ status: 'succeeded' }]);
});

it('regression: revoking the source language policy prevents the durable afterCommit side effect', async () => {
  let permitted = true;
  const { kit, received } = await fixture(() => permitted);
  permitted = false;
  await kit.content.maintenance();
  expect(received).toEqual([]);
  expect(
    (
      await kit.database.query(
        "SELECT status,failure_code FROM content_jobs WHERE action='extension'",
      )
    ).rows,
  ).toEqual([{ status: 'failed', failure_code: 'forbidden' }]);
});

it('migration rejects legacy in-flight work and preserves terminal tasks without guessing a language', async () => {
  const { kit } = await fixture(() => true);
  const source = await readFile(
    new URL('../../../../../database/migrations/0018_extension_source_locale.sql', import.meta.url),
    'utf8',
  );
  await kit.database.query(
    'ALTER TABLE content_jobs DROP CONSTRAINT content_job_source_locale_shape, DROP CONSTRAINT content_job_source_locale_valid, DROP COLUMN source_locale',
  );
  await expect(kit.database.transaction((tx) => tx.query(source))).rejects.toMatchObject({
    code: '55000',
  });
  expect(
    (
      await kit.database.query(
        "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='content_jobs' AND column_name='source_locale'",
      )
    ).rowCount,
  ).toBe(0);
  await kit.database.query(
    "UPDATE content_jobs SET status='failed',failure_code='temporarily_unavailable',finished_at=clock_timestamp() WHERE action='extension'",
  );
  await kit.database.transaction((tx) => tx.query(source));
  expect((await kit.database.query('SELECT source_locale FROM content_jobs')).rows).toEqual([
    { source_locale: null },
  ]);
  await expect(
    kit.database.query(
      "UPDATE content_jobs SET status='queued',finished_at=NULL WHERE action='extension'",
    ),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    kit.database.query("UPDATE content_jobs SET action='batch',source_locale='zh'"),
  ).rejects.toMatchObject({ code: '23514' });
  await kit.database.query(
    "UPDATE content_jobs SET source_locale='zh',status='queued',finished_at=NULL,failure_code=NULL WHERE action='extension'",
  );
  await kit.content.maintenance();
  expect((await kit.database.query('SELECT status,source_locale FROM content_jobs')).rows).toEqual([
    { status: 'succeeded', source_locale: 'zh' },
  ]);
});

it('readiness fails before the source-locale migration is registered', async () => {
  const { kit } = await fixture(() => true);
  await kit.database.query(
    "DELETE FROM cms_migrations WHERE name='0018_extension_source_locale.sql'",
  );
  await expect(kit.content.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});

it('discovers and inspects an extension in its persisted language even when the caller uses the default locale', async () => {
  let permitted = true;
  const { kit, document } = await fixture(() => permitted);
  const page = await kit.content.api.listJobs(kit.owner(), {
    collection: 'articles',
    action: 'extension',
  });
  expect(page).toMatchObject({
    total: 1,
    rows: [{ action: 'extension', locale: 'zh', documentId: document.id }],
  });
  const [job] = page.rows;
  if (!job) throw new Error('Missing extension job');
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.id }),
  ).toMatchObject({ id: job.id, locale: 'zh', status: 'queued' });
  permitted = false;
  expect(
    await kit.content.api.listJobs(kit.owner(), { collection: 'articles', action: 'extension' }),
  ).toMatchObject({ total: 0, rows: [] });
  await expect(
    kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: job.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
