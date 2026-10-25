import { afterEach, expect, it } from 'vitest';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import {
  createContentMediaFixture,
  mediaCollections,
} from '../../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';

const fixtures: ContentMediaFixture[] = [];
afterEach(async () => {
  for (const resource of fixtures.splice(0).toReversed()) await resource.close();
});
async function fixture(options: Parameters<typeof createContentMediaFixture>[0] = {}) {
  const result = await createContentMediaFixture(options);
  fixtures.push(result);
  return result;
}
async function pending(kit: ContentMediaFixture, ctx: RequestContext, filename = 'private.pdf') {
  return kit.assets.api.createUpload(ctx, {
    collection: 'media',
    purpose: 'create',
    filename,
    mimeType: 'application/pdf',
    bytes: 28,
  });
}
async function ready(
  kit: ContentMediaFixture,
  ctx: () => RequestContext,
  target?: { id: string; revision: number },
) {
  const bytes = new TextEncoder().encode('%PDF-1.7\nprivate bytes\n%%EOF');
  const upload = await kit.assets.api.createUpload(ctx(), {
    collection: 'media',
    purpose: target ? 'replace' : 'create',
    filename: 'private.pdf',
    mimeType: 'application/pdf',
    bytes: bytes.length,
    ...(target ? { documentId: target.id, revision: target.revision } : {}),
  });
  await kit.assets.api.writeUpload(
    ctx(),
    { collection: 'media', uploadId: upload.id },
    new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
  await kit.assets.api.completeUpload(ctx(), { collection: 'media', uploadId: upload.id });
  await kit.assets.maintenance();
  return kit.assets.api.readUpload(ctx(), { collection: 'media', uploadId: upload.id });
}
const permissions = [
  'documents.create',
  'documents.get',
  'documents.update',
  'assets.createUpload',
  'assets.writeUpload',
  'assets.completeUpload',
  'assets.readUpload',
  'assets.download',
  'assets.listUploads',
  'content.getJob',
  'content.listJobs',
].map((operation) => `media:${operation}`);

it('discovers only actor uploads with declaration fields, deterministic pages and the correct total for an empty last page', async () => {
  const kit = await fixture();
  await pending(kit, kit.owner(), 'one.pdf');
  await pending(kit, kit.owner(), 'two.pdf');
  await pending(kit, kit.owner(), 'three.pdf');
  const actor = await contentActor(kit, permissions);
  const own = await pending(kit, actor.ctx(), 'actor-only.pdf');
  const page = await kit.content.api.listUploads(kit.owner(), { collection: 'media', pageSize: 1 });
  expect(page).toMatchObject({ total: 3, page: 1, pageSize: 1 });
  expect(page.rows[0]).toMatchObject({
    filename: 'three.pdf',
    declaredMimeType: 'application/pdf',
    declaredBytes: 28,
    status: 'pending',
    documentId: null,
    revision: null,
  });
  expect(page.rows[0]).not.toHaveProperty('manifest');
  expect(
    await kit.content.api.listUploads(kit.owner(), { collection: 'media', page: 9, pageSize: 1 }),
  ).toMatchObject({ rows: [], total: 3 });
  expect(await kit.content.api.listUploads(actor.ctx(), { collection: 'media' })).toMatchObject({
    total: 1,
    rows: [{ id: own.id, filename: 'actor-only.pdf' }],
  });
  expect(
    await kit.content.api.listUploads(kit.owner(), { collection: 'media', status: 'ready' }),
  ).toMatchObject({ total: 0, rows: [] });
  await expect(
    kit.content.api.listUploads(actor.ctx(), { collection: 'media', pageSize: 101 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.listUploads(actor.ctx(), {
      collection: 'media',
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('excludes create sessions without a document when the new list operation has a target Where', async () => {
  const collections = mediaCollections();
  const media = collections.find((collection) => collection.key === 'media');
  if (!media) throw new Error('Media missing');
  media.access = {
    'assets.listUploads': {
      version: 'media-title-v1',
      run: () => ({ field: 'title', operator: 'eq', value: 'Allowed' }),
    },
  };
  const kit = await fixture({ collections });
  const upload = await ready(kit, kit.owner);
  expect(await kit.content.api.listUploads(kit.owner(), { collection: 'media' })).toMatchObject({
    total: 0,
    rows: [],
  });
  const mediaDoc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: upload.id,
    data: { title: 'Allowed' },
  });
  expect(
    await kit.content.api.listUploads(kit.owner(), {
      collection: 'media',
      documentId: mediaDoc.id,
    }),
  ).toMatchObject({
    total: 1,
    rows: [{ id: upload.id, documentId: null, revision: null, status: 'consumed' }],
  });
});

it('upload and job discovery recheck bound historical revision permission and keep original upload target semantics', async () => {
  const kit = await fixture();
  const actor = await contentActor(kit, permissions);
  const first = await ready(kit, actor.ctx);
  const media = await kit.content.api.createDocument(actor.ctx(), {
    collection: 'media',
    uploadId: first.id,
    data: { title: 'Visible' },
  });
  const second = await ready(kit, actor.ctx, media);
  await kit.content.api.updateDocument(actor.ctx(), {
    collection: 'media',
    id: media.id,
    revision: media.revision,
    uploadId: second.id,
  });
  const page = await kit.content.api.listUploads(actor.ctx(), {
    collection: 'media',
    documentId: media.id,
  });
  expect(page).toMatchObject({
    total: 1,
    rows: [{ id: second.id, purpose: 'replace', documentId: media.id, revision: 1 }],
  });
  expect(
    await kit.content.api.listJobs(actor.ctx(), { collection: 'media', documentId: media.id }),
  ).toMatchObject({ total: 1, rows: [{ kind: 'asset', action: 'process', documentId: media.id }] });
  await expect(
    kit.assets.api.readUpload(actor.ctx(), { collection: 'media', uploadId: first.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  if (!first.jobId) throw new Error('Expected processing job');
  await expect(
    kit.content.api.getJob(actor.ctx(), { collection: 'media', jobId: first.jobId }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  const ids = [...permissions, 'media:versions.get'].flatMap((permission) => {
    const id = kit.permissionIds.get(permission);
    return id ? [id] : [];
  });
  if (ids.length !== permissions.length + 1) throw new Error('Missing fixture permission');
  await kit.access.api.replaceRolePermissions(kit.owner(), {
    id: actor.role.id,
    version: actor.role.version,
    permissionIds: ids,
  });
  expect(
    await kit.content.api.listUploads(actor.ctx(), { collection: 'media', documentId: media.id }),
  ).toMatchObject({ total: 2 });
  expect(
    await kit.content.api.listJobs(actor.ctx(), { collection: 'media', documentId: media.id }),
  ).toMatchObject({ total: 2 });
  expect(await kit.content.api.listJobs(kit.owner(), { collection: 'media' })).toMatchObject({
    total: 0,
    rows: [],
  });
});

it('a read-only uploads discovery request remains available while another transaction holds the content mutation fence', async () => {
  const kit = await fixture();
  await pending(kit, kit.owner());
  const held = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const holder = kit.database.transaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      kit.contentOptions.workPolicy.resourceLockKey,
    ]);
    held.resolve();
    await release.promise;
  });
  void holder.catch((error: unknown) => held.reject(error));
  try {
    await held.promise;
    const ctx = { ...kit.owner(), signal: AbortSignal.timeout(5000) };
    expect(await kit.content.api.listUploads(ctx, { collection: 'media' })).toMatchObject({
      total: 1,
    });
  } finally {
    release.resolve();
    await holder;
  }
});

async function hiddenAssetJob() {
  const collections = mediaCollections();
  const media = collections.find((collection) => collection.key === 'media');
  if (!media) throw new Error('Media missing');
  media.access = {
    'content.getJob': {
      version: 'job-owner-title',
      run: () => ({ field: 'title', operator: 'eq', value: 'Allowed' }),
    },
  };
  const kit = await fixture({ collections });
  const upload = await ready(kit, kit.owner);
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: upload.id,
    data: { title: 'Disallowed' },
  });
  if (!upload.jobId) throw new Error('Expected owned processing job');
  return { kit, jobId: upload.jobId };
}

it('asset job discovery applies the job read operation Where to owned media instead of bypassing it', async () => {
  const { kit } = await hiddenAssetJob();
  expect(await kit.content.api.listJobs(kit.owner(), { collection: 'media' })).toMatchObject({
    total: 0,
    rows: [],
  });
});

it('asset job details apply their read operation Where instead of bypassing it through fallback', async () => {
  const { kit, jobId } = await hiddenAssetJob();
  await expect(
    kit.content.api.getJob(kit.owner(), { collection: 'media', jobId }),
  ).rejects.toMatchObject({ code: 'not_found' });
});
