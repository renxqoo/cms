import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  createContentMediaFixture,
  mediaCollections,
} from '../../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { contentCollection } from '../../../../../../test/support/content-runtime.ts';
import { png } from '../../../../../../test/support/png.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';

const fixtures: ContentMediaFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function ready(
  kit: ContentMediaFixture,
  ctx: RequestContext,
  target?: { documentId: string; revision: number; locale: string },
) {
  const bytes = png([40, 80, 120]);
  const created = await kit.assets.api.createUpload(ctx, {
    collection: 'media',
    purpose: target ? 'replace' : 'create',
    filename: 'image.png',
    mimeType: 'image/png',
    bytes: bytes.length,
    ...target,
  });
  await kit.assets.api.writeUpload(
    ctx,
    { collection: 'media', uploadId: created.id },
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
  const job = await kit.assets.api.completeUpload(ctx, {
    collection: 'media',
    uploadId: created.id,
  });
  await kit.assets.maintenance();
  const session = await kit.assets.api.readUpload(ctx, {
    collection: 'media',
    uploadId: created.id,
  });
  expect(session.status).toBe('ready');
  return { session, job };
}

async function fixture() {
  const collections = mediaCollections();
  const media = contentCollection(collections, 'media');
  media.lockDocuments = { durationMs: 300000, heartbeatMs: 30000 };
  const authorization = { allowEnglish: false, allowChinese: true };
  media.access = {
    'documents.update': {
      version: 'zh-write',
      run: ({ actor, locale }) =>
        actor.role.isSuper ||
        (locale === 'zh' ? authorization.allowChinese : authorization.allowEnglish),
    },
  };
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  const initial = await ready(kit, kit.owner());
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    dataByLocale: { en: { title: 'English' }, zh: { title: '中文' } },
    uploadId: initial.session.id,
  });
  const actor = await contentActor(
    kit,
    [
      'documents.get',
      'documents.update',
      'documents.acquireLock',
      'documents.releaseLock',
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.download',
      'assets.reprocess',
      'content.getJob',
      'assets.listUploads',
    ].map((operation) => `media:${operation}`),
  );
  const editorId = randomUUID();
  const ctx = { ...actor.ctx(), editorSessionId: editorId };
  await kit.content.api.acquireEditorLease(ctx, {
    collection: 'media',
    id: document.id,
    editorId,
    locale: 'zh',
  });
  return { kit, actor, document, ctx, editorId, authorization };
}

it('regression: Chinese-only editors replace files through a Chinese upload session and cannot consume it as English', async () => {
  const { kit, document, ctx, editorId, authorization } = await fixture();
  const { session, job } = await ready(kit, ctx, {
    documentId: document.id,
    revision: document.revision,
    locale: 'zh',
  });
  expect(session.locale).toBe('zh');
  await expect(
    kit.content.api.getJob(ctx, { collection: 'media', jobId: job.jobId, locale: 'zh' }),
  ).resolves.toMatchObject({ status: 'succeeded' });
  await expect(
    kit.content.api.getJob(ctx, { collection: 'media', jobId: job.jobId, locale: 'en' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const listed = await kit.content.api.listUploads(ctx, { collection: 'media', locale: 'zh' });
  expect(listed.rows.map((row) => row.id)).toContain(session.id);
  expect(
    (await kit.content.api.listUploads(ctx, { collection: 'media', locale: 'en' })).rows.map(
      (row) => row.id,
    ),
  ).not.toContain(session.id);
  await kit.content.api.releaseEditorLease(ctx, {
    collection: 'media',
    id: document.id,
    editorId,
    generation: 1,
    locale: 'zh',
  });
  await expect(
    kit.content.api.updateDocument(ctx, {
      collection: 'media',
      id: document.id,
      revision: document.revision,
      uploadId: session.id,
      locale: 'en',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  authorization.allowEnglish = true;
  await expect(
    kit.content.api.updateDocument(ctx, {
      collection: 'media',
      id: document.id,
      revision: document.revision,
      uploadId: session.id,
      locale: 'en',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const updated = await kit.content.api.updateDocument(ctx, {
    collection: 'media',
    id: document.id,
    revision: document.revision,
    uploadId: session.id,
    locale: 'zh',
  });
  expect(updated.file?.id).toBe(session.manifest?.id);
  expect(updated.data['title']).toBe('中文');
});

it('regression: image workers retain the Chinese authorization locale through final document commit', async () => {
  const { kit, document, ctx } = await fixture();
  const job = await kit.assets.api.reprocess(ctx, {
    collection: 'media',
    id: document.id,
    revision: document.revision,
    locale: 'zh',
    recipe: { variants: [] },
  });
  await kit.assets.maintenance();
  await expect(
    kit.content.api.getJob(ctx, { collection: 'media', jobId: job.jobId, locale: 'zh' }),
  ).resolves.toMatchObject({ status: 'succeeded' });
  const updated = await kit.content.api.getDocument(ctx, {
    collection: 'media',
    id: document.id,
    locale: 'zh',
  });
  expect(updated.revision).toBe(document.revision + 1);
  expect(updated.data['title']).toBe('中文');
  expect(updated.file?.id).not.toBe(document.file?.id);
  expect(
    (await kit.assets.api.readUpload(ctx, { collection: 'media', uploadId: job.uploadId })).locale,
  ).toBe('zh');
});

it('regression: image workers stop when the original Chinese write permission is revoked after acceptance', async () => {
  const { kit, document, ctx, authorization } = await fixture();
  const job = await kit.assets.api.reprocess(ctx, {
    collection: 'media',
    id: document.id,
    revision: document.revision,
    locale: 'zh',
    recipe: { variants: [] },
  });
  authorization.allowChinese = false;
  authorization.allowEnglish = true;
  await kit.assets.maintenance();
  const stored = await kit.database.query<{ status: string; failure_code: string }>(
    'SELECT status,failure_code FROM asset_jobs WHERE id=$1',
    [job.jobId],
  );
  expect(stored.rows).toEqual([{ status: 'failed', failure_code: 'forbidden' }]);
  const unchanged = await kit.content.api.getDocument(ctx, {
    collection: 'media',
    id: document.id,
    locale: 'zh',
  });
  expect(unchanged.revision).toBe(document.revision);
  expect(unchanged.file?.id).toBe(document.file?.id);
});
