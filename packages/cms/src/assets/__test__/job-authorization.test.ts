import { afterEach, expect, it } from 'vitest';
import {
  createContentMediaFixture,
  mediaCollections,
} from '../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../test/support/content-media-runtime.ts';
import { contentActor } from '../../../../../test/support/content-actor.ts';
import { contentCollection } from '../../../../../test/support/content-runtime.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';

const fixtures: ContentMediaFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0).toReversed()) await kit.close();
});
const bytes = new TextEncoder().encode('%PDF-1.7\nprivate job authorization bytes\n%%EOF');
async function upload(
  kit: ContentMediaFixture,
  ctx: () => RequestContext,
  target?: { documentId: string; revision: number },
) {
  const session = await kit.assets.api.createUpload(ctx(), {
    collection: 'media',
    purpose: target ? 'replace' : 'create',
    filename: 'private.pdf',
    mimeType: 'application/pdf',
    bytes: bytes.byteLength,
    ...target,
  });
  await kit.assets.api.writeUpload(
    ctx(),
    { collection: 'media', uploadId: session.id },
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
  const processing = await kit.assets.api.completeUpload(ctx(), {
    collection: 'media',
    uploadId: session.id,
  });
  return { uploadId: session.id, jobId: processing.jobId };
}
async function media(kit: ContentMediaFixture) {
  const uploaded = await upload(kit, kit.owner);
  await kit.assets.maintenance();
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: uploaded.uploadId,
    data: { title: 'Private media' },
  });
  return { ...document, jobId: uploaded.jobId };
}

it('a replacement processing job remains readable for an editor without document creation permission', async () => {
  const kit = await createContentMediaFixture();
  fixtures.push(kit);
  const document = await media(kit);
  const editor = await contentActor(kit, [
    'media:documents.get',
    'media:documents.update',
    'media:assets.download',
    'media:assets.createUpload',
    'media:assets.writeUpload',
    'media:assets.completeUpload',
    'media:assets.readUpload',
    'media:content.getJob',
  ]);
  const queued = await upload(kit, editor.ctx, {
    documentId: document.id,
    revision: document.revision,
  });
  await expect(
    kit.content.api.getJob(editor.ctx(), { collection: 'media', jobId: queued.jobId }),
  ).resolves.toMatchObject({ id: queued.jobId, status: 'queued' });
});

it('a consumed upload processing job stops exposing its manifest when bound document reading is revoked', async () => {
  let visible = true;
  const collections = mediaCollections();
  contentCollection(collections, 'media').access = {
    'documents.get': { version: '1', run: () => visible },
  };
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  const document = await media(kit);
  await expect(
    kit.content.api.getJob(kit.owner(), { collection: 'media', jobId: document.jobId }),
  ).resolves.toMatchObject({ status: 'succeeded' });
  visible = false;
  await expect(
    kit.content.api.getJob(kit.owner(), { collection: 'media', jobId: document.jobId }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('a processing job reader participates in its caller transaction instead of opening a second snapshot', async () => {
  const kit = await createContentMediaFixture();
  fixtures.push(kit);
  const queued = await upload(kit, kit.owner);
  await kit.database.transaction(async (tx) => {
    await tx.query("UPDATE asset_jobs SET status='cancelled' WHERE id=$1", [queued.jobId]);
    await tx.query("UPDATE asset_uploads SET status='cancelled' WHERE id=$1", [queued.uploadId]);
    expect(
      await kit.assets.api.readJob(kit.owner(), { collection: 'media', jobId: queued.jobId }, tx),
    ).toMatchObject({ status: 'cancelled' });
  });
});
