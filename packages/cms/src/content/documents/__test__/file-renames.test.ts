import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { contentCollection } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import { png } from '../../../../../../test/support/png.ts';
import type { CollectionDefinition } from '../../definition.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';

const fixtures: ContentMediaFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(change?: (media: CollectionDefinition) => void) {
  const collections = mediaCollections();
  change?.(contentCollection(collections, 'media'));
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  return kit;
}
async function createFile(kit: ContentMediaFixture) {
  const { uploadId } = await readyContentUpload(kit);
  return kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId,
    dataByLocale: { en: { title: 'Original' }, zh: { title: '原文件' } },
  });
}
async function download(
  kit: ContentMediaFixture,
  input: {
    id: string;
    collection?: string;
    versionId?: string;
    bindingId?: string;
    variant?: string;
    mode?: 'editing' | 'published';
  },
) {
  const file = await kit.assets.api.download(kit.owner(), { collection: 'media', ...input });
  return { ...file, bytes: new Uint8Array(await new Response(file.stream).arrayBuffer()) };
}
it('renames only the current file snapshot and preserves published, restored and externally bound filenames', async () => {
  const kit = await fixture((media) => {
    media.mode = 'drafts';
    media.drafts = { validate: false };
    media.history = { maxVersions: 0, retentionMs: 0 };
  });
  const original = await createFile(kit);
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'media',
    id: original.id,
    revision: original.revision,
  });
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Bound original', cover: { collection: 'media', id: original.id } },
  });
  const ctx = kit.owner();
  const input = {
    collection: 'media',
    id: original.id,
    revision: published.revision,
    filename: 'Renamed.PDF',
  };
  const renamed = await kit.content.api.renameFile(ctx, input);
  expect(renamed.revision).toBe(published.revision + 1);
  expect(renamed.file?.filename).toBe('Renamed.PDF');
  expect(renamed.file?.id).not.toBe(original.file?.id);
  expect(renamed.file?.digest).toBe(original.file?.digest);
  expect((await kit.content.api.renameFile(ctx, input)).versionId).toBe(renamed.versionId);
  expect((await download(kit, { id: original.id, mode: 'published' })).filename).toBe(
    'original.pdf',
  );
  expect((await download(kit, { id: original.id, versionId: original.versionId })).filename).toBe(
    'original.pdf',
  );
  const bindingId = article.mediaBindings?.[0]?.bindingId;
  if (!bindingId) throw new Error('Binding missing');
  expect(
    (await download(kit, { collection: 'articles', id: article.id, bindingId })).filename,
  ).toBe('original.pdf');
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'media',
    id: original.id,
    revision: renamed.revision,
    versionId: original.versionId,
  });
  expect(restored.file?.filename).toBe('original.pdf');
});
it('keeps shared bytes downloadable after cleanup retires an unreferenced renamed manifest', async () => {
  const kit = await fixture((media) => {
    media.history = { maxVersions: 2, retentionMs: 0 };
  });
  const original = await createFile(kit);
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Old binding', cover: { collection: 'media', id: original.id } },
  });
  const second = await kit.content.api.renameFile(kit.owner(), {
    collection: 'media',
    id: original.id,
    revision: original.revision,
    filename: 'second.pdf',
  });
  const third = await kit.content.api.renameFile(kit.owner(), {
    collection: 'media',
    id: original.id,
    revision: second.revision,
    filename: 'third.pdf',
  });
  const final = await kit.content.api.renameFile(kit.owner(), {
    collection: 'media',
    id: original.id,
    revision: third.revision,
    filename: 'final.pdf',
  });
  await kit.database.query(
    "UPDATE asset_manifests SET retain_until=clock_timestamp()-interval '1 hour'",
  );
  await kit.database.query(
    "UPDATE asset_objects SET retain_until=clock_timestamp()-interval '1 hour'",
  );
  await kit.assets.maintenance();
  expect(
    (
      await kit.database.query<{ state: string }>('SELECT state FROM asset_manifests WHERE id=$1', [
        second.file?.id,
      ])
    ).rows,
  ).toEqual([{ state: 'deleted' }]);
  const now = await download(kit, { id: final.id });
  const historical = await download(kit, { id: final.id, versionId: third.versionId });
  const bindingId = article.mediaBindings?.[0]?.bindingId;
  if (!bindingId) throw new Error('Binding missing');
  const bound = await download(kit, { collection: 'articles', id: article.id, bindingId });
  expect([now.filename, historical.filename, bound.filename]).toEqual([
    'final.pdf',
    'third.pdf',
    'original.pdf',
  ]);
  expect(now.bytes).toEqual(historical.bytes);
  expect(now.bytes).toEqual(bound.bytes);
  expect(
    (await kit.database.query<{ state: string }>('SELECT state FROM asset_objects')).rows.every(
      (row) => row.state === 'ready',
    ),
  ).toBe(true);
});
async function imageFile(kit: ContentMediaFixture, ctx: RequestContext) {
  const bytes = png([20, 40, 60]);
  const session = await kit.assets.api.createUpload(ctx, {
    collection: 'media',
    purpose: 'create',
    filename: 'image.png',
    mimeType: 'image/png',
    bytes: bytes.length,
  });
  await kit.assets.api.writeUpload(
    ctx,
    { collection: 'media', uploadId: session.id },
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
  await kit.assets.api.completeUpload(ctx, { collection: 'media', uploadId: session.id });
  await kit.assets.maintenance();
  return kit.content.api.createDocument(ctx, {
    collection: 'media',
    uploadId: session.id,
    data: { title: 'Image' },
  });
}
it('uses the renamed stem and actual derived MIME in variant downloads and fences a queued reprocess against rename', async () => {
  const kit = await fixture();
  const doc = await imageFile(kit, kit.owner());
  const before = await download(kit, { id: doc.id, variant: 'tiny' });
  expect(before.filename).toBe('image-tiny.webp');
  const job = await kit.assets.api.reprocess(kit.owner(), {
    collection: 'media',
    id: doc.id,
    revision: doc.revision,
    recipe: { variants: [] },
  });
  const renamed = await kit.content.api.renameFile(kit.owner(), {
    collection: 'media',
    id: doc.id,
    revision: doc.revision,
    filename: 'New.PNG',
  });
  const after = await download(kit, { id: doc.id, variant: 'tiny' });
  expect(after.filename).toBe('New-tiny.webp');
  expect(after.bytes).toEqual(before.bytes);
  await kit.assets.maintenance();
  expect(
    await kit.content.api.getJob(kit.owner(), { collection: 'media', jobId: job.jobId }),
  ).toMatchObject({ status: 'failed' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'media', id: doc.id })).file
      ?.filename,
  ).toBe(renamed.file?.filename);
});
it('rejects invalid names, stale revisions, cancellation and non-upload collections without creating extra manifests', async () => {
  const kit = await fixture();
  const doc = await createFile(kit);
  for (const filename of [
    'original.pdf',
    'other.png',
    '../new.pdf',
    'x\\new.pdf',
    '\u0000.pdf',
    '..',
    ' ',
  ])
    await expect(
      kit.content.api.renameFile(kit.owner(), {
        collection: 'media',
        id: doc.id,
        revision: doc.revision,
        filename,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.renameFile(kit.owner(), {
      collection: 'media',
      id: doc.id,
      revision: doc.revision + 1,
      filename: 'new.pdf',
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  const controller = new AbortController();
  controller.abort();
  await expect(
    kit.content.api.renameFile(
      { ...kit.owner(), signal: controller.signal },
      { collection: 'media', id: doc.id, revision: doc.revision, filename: 'new.pdf' },
    ),
  ).rejects.toBeDefined();
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Article' },
  });
  await expect(
    kit.content.api.renameFile(kit.owner(), {
      collection: 'articles',
      id: article.id,
      revision: article.revision,
      filename: 'new.pdf',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.database.query<{ count: string }>('SELECT count(*) FROM asset_manifests')).rows[0]
      ?.count,
  ).toBe('1');
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'media', id: doc.id })).revision,
  ).toBe(doc.revision);
});
it('rechecks locale write permission and owned editor sessions, including after a successful rename replay', async () => {
  const authorization = { allowed: true };
  const kit = await fixture((media) => {
    media.lockDocuments = { durationMs: 300000, heartbeatMs: 30000 };
    media.access = {
      'documents.update': {
        version: 'zh-only',
        run: ({ actor, locale }) =>
          actor.role.isSuper || (locale === 'zh' && authorization.allowed),
      },
    };
  });
  const doc = await createFile(kit);
  const actor = await contentActor(
    kit,
    [
      'documents.renameFile',
      'documents.get',
      'documents.update',
      'assets.download',
      'documents.acquireLock',
    ].map((operation) => `media:${operation}`),
  );
  const editorId = randomUUID();
  const ctx = { ...actor.ctx(), editorSessionId: editorId };
  await kit.content.api.acquireEditorLease(ctx, {
    collection: 'media',
    id: doc.id,
    editorId,
    locale: 'zh',
  });
  const input = {
    collection: 'media',
    id: doc.id,
    revision: doc.revision,
    filename: '中文.PDF',
    locale: 'zh',
  };
  await expect(kit.content.api.renameFile(actor.ctx(), input)).rejects.toMatchObject({
    code: 'document_locked',
  });
  await expect(kit.content.api.renameFile(ctx, { ...input, locale: 'en' })).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect((await kit.content.api.renameFile(ctx, input)).file?.filename).toBe('中文.PDF');
  authorization.allowed = false;
  await expect(kit.content.api.renameFile(ctx, input)).rejects.toMatchObject({ code: 'forbidden' });
});
it('rolls back a cloned manifest and document revision when a current collection hook rejects the rename', async () => {
  const behavior = { reject: false };
  const kit = await fixture((media) => {
    media.hooks = {
      afterChange: [
        {
          version: 'rename-guard',
          run: () => {
            if (behavior.reject) throw new Error('Revision rejected');
          },
        },
      ],
    };
  });
  const doc = await createFile(kit);
  behavior.reject = true;
  await expect(
    kit.content.api.renameFile(kit.owner(), {
      collection: 'media',
      id: doc.id,
      revision: doc.revision,
      filename: 'rejected.pdf',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.database.query<{ count: string }>('SELECT count(*) FROM asset_manifests')).rows[0]
      ?.count,
  ).toBe('1');
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'media', id: doc.id })).file
      ?.filename,
  ).toBe('original.pdf');
});
