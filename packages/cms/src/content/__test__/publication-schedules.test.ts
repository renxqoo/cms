import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../test/support/content-actor.ts';

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

it('allows scheduling with withdrawal permission alone and rechecks that permission when the job executes', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Keep public' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  const grants = [
    'articles:collections.editor',
    'articles:documents.get',
    'articles:content.schedulePublication',
    'articles:documents.unpublish',
  ];
  const editor = await contentActor(kit, grants);
  const descriptor = await kit.content.api.getEditor(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    intent: 'read',
  });
  expect(
    descriptor.actions.find((action) => action.operationId === 'content.schedulePublication')
      ?.state,
  ).toBe('conditional');
  const schedule = await kit.content.api.schedulePublication(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    versionId: published.versionId,
    action: 'unpublish',
    executeAt: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: schedule.jobId }),
  ).toMatchObject({ publicationAction: 'unpublish', locale: 'en' });
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: editor.role.id,
    version: editor.role.version,
    permissionIds: grants
      .filter((key) => key !== 'articles:documents.unpublish')
      .map((key) => kit.permissionIds.get(key)),
  });
  await kit.database.query('UPDATE content_jobs SET execute_at=clock_timestamp() WHERE id=$1', [
    schedule.jobId,
  ]);
  await kit.content.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'articles', jobId: schedule.jobId }),
  ).toMatchObject({ status: 'failed', items: [{ error: { code: 'forbidden' } }] });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      mode: 'published',
    }),
  ).toMatchObject({ data: { title: 'Keep public' } });
});

it('lets a Chinese-only editor schedule, discover, inspect and cancel a Chinese withdrawal', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  const operations = [
    'documents.get',
    'documents.unpublish',
    'content.schedulePublication',
    'content.listJobs',
    'content.getJob',
    'content.cancelPublicationSchedule',
  ];
  articles.access = Object.fromEntries(
    operations.map((operation) => [
      operation,
      {
        version: 'chinese-only-v1',
        run: ({ actor, locale }: { actor: { role: { isSuper: boolean } }; locale: string }) =>
          actor.role.isSuper || locale === 'zh',
      },
    ]),
  );
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    data: { title: '中文发布' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'zh',
  });
  const editor = await contentActor(
    kit,
    operations.map((operation) => `articles:${operation}`),
  );
  const schedule = await kit.content.api.schedulePublication(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    locale: 'zh',
    revision: published.revision,
    versionId: first.versionId,
    action: 'unpublish',
    executeAt: new Date(Date.now() + 60_000).toISOString(),
  });
  expect(
    await kit.content.api.getJob(editor.ctx(), {
      collection: 'articles',
      jobId: schedule.jobId,
      locale: 'zh',
    }),
  ).toMatchObject({ id: schedule.jobId, locale: 'zh', status: 'queued', total: 1 });
  expect(
    await kit.content.api.listJobs(editor.ctx(), { collection: 'articles', locale: 'zh' }),
  ).toMatchObject({ total: 1, rows: [{ id: schedule.jobId, locale: 'zh', total: 1 }] });
  await kit.content.api.cancelPublicationSchedule(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    scheduleId: schedule.jobId,
    locale: 'zh',
  });
  expect(
    await kit.content.api.getJob(editor.ctx(), {
      collection: 'articles',
      jobId: schedule.jobId,
      locale: 'zh',
    }),
  ).toMatchObject({ status: 'cancelled' });
  expect(schedule.location).toContain('?locale=zh');
});

it('does not let cancellation authorization in English bypass the stored Chinese schedule language', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  articles.access = {
    'content.cancelPublicationSchedule': {
      version: 'english-cancellation-v1',
      run: ({ actor, locale }) => actor.role.isSuper || locale === 'en',
    },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
    data: { title: '中文保持' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'zh',
  });
  const schedule = await kit.content.api.schedulePublication(kit.owner(), {
    collection: 'articles',
    id: first.id,
    locale: 'zh',
    revision: published.revision,
    versionId: first.versionId,
    action: 'unpublish',
    executeAt: new Date(Date.now() + 60_000).toISOString(),
  });
  const editor = await contentActor(kit, [
    'articles:content.cancelPublicationSchedule',
    'articles:documents.get',
  ]);
  await expect(
    kit.content.api.cancelPublicationSchedule(editor.ctx(), {
      collection: 'articles',
      id: first.id,
      scheduleId: schedule.jobId,
      locale: 'en',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    await kit.content.api.getJob(kit.owner(), {
      collection: 'articles',
      jobId: schedule.jobId,
      locale: 'zh',
    }),
  ).toMatchObject({ status: 'queued', locale: 'zh' });
});
