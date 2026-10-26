import { afterEach, expect, it } from 'vitest';
import { createContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('schedules withdrawal of the selected published version without publishing the working draft', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Public' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
  });
  const edited = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: published.revision,
    data: { title: 'Private working draft' },
  });
  const schedule = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: edited.revision,
    versionId: published.publishedVersionId,
    action: 'unpublish',
    executeAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    schedule.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: schedule.jobId }),
  ).toMatchObject({ status: 'succeeded', succeeded: 1 });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(
    await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: draft.id }),
  ).toMatchObject({ data: { title: 'Private working draft' }, publishedVersionId: null });
});

it('fails a stale withdrawal schedule without withdrawing a newer publication', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'First' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
  });
  const schedule = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: published.revision,
    versionId: published.versionId,
    action: 'unpublish',
    executeAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const edited = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: published.revision,
    data: { title: 'Second' },
  });
  await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: edited.revision,
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    schedule.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: schedule.jobId }),
  ).toMatchObject({ status: 'failed', items: [{ error: { code: 'version_conflict' } }] });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      mode: 'published',
    }),
  ).toMatchObject({ data: { title: 'Second' } });
});
