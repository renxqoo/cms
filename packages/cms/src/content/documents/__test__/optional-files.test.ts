import { afterEach, expect, it } from 'vitest';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { contentCollection } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import type { CollectionDefinition } from '../../definition.ts';

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
it('requires a file for direct creation by default and exposes the current setting to the editor', async () => {
  const kit = await fixture();
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'media',
      data: { title: 'Missing file' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.content.api.getEditor(kit.owner(), { collection: 'media', intent: 'create' })).upload
      ?.filesRequiredOnCreate,
  ).toBe(true);
});
it('allows an optional-file document to be read, edited, copied and restored before attaching its first file', async () => {
  const kit = await fixture((media) => {
    if (!media.upload) throw new Error('Upload missing');
    media.upload.filesRequiredOnCreate = false;
    media.history = { maxVersions: 0, retentionMs: 0 };
  });
  const initial = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    data: { title: 'Metadata first' },
  });
  expect(initial.file).toBeUndefined();
  const read = await kit.content.api.getDocument(kit.owner(), {
    collection: 'media',
    id: initial.id,
  });
  expect(read.data['title']).toBe('Metadata first');
  expect(read.file).toBeUndefined();
  await expect(download(kit, { id: initial.id })).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.renameFile(kit.owner(), {
      collection: 'media',
      id: initial.id,
      revision: initial.revision,
      filename: 'new.pdf',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const edited = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'media',
    id: initial.id,
    revision: initial.revision,
    data: { title: 'Edited' },
  });
  const copied = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'media',
    id: edited.id,
    revision: edited.revision,
  });
  expect(copied.id).not.toBe(initial.id);
  expect(copied.file).toBeUndefined();
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'media',
    id: edited.id,
    revision: edited.revision,
    versionId: initial.versionId,
  });
  expect(restored.file).toBeUndefined();
  expect(restored.data['title']).toBe('Metadata first');
  const upload = await readyContentUpload(kit, {
    target: { documentId: initial.id, revision: restored.revision },
  });
  const attached = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'media',
    id: initial.id,
    revision: restored.revision,
    uploadId: upload.uploadId,
  });
  expect(attached.file?.filename).toBe('original.pdf');
  expect((await download(kit, { id: initial.id })).bytes).toEqual(
    new TextEncoder().encode('%PDF-1.7\nprivate original bytes\n%%EOF'),
  );
  expect(
    (await kit.content.api.getEditor(kit.owner(), { collection: 'media', intent: 'create' })).upload
      ?.filesRequiredOnCreate,
  ).toBe(false);
});
it('allows fileless draft creation while retaining required-file behavior for direct collections', async () => {
  const kit = await fixture((media) => {
    media.mode = 'drafts';
    media.drafts = { validate: false };
  });
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    data: {},
  });
  expect(created.file).toBeUndefined();
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'media',
    id: created.id,
    revision: created.revision,
    data: { title: 'Now complete' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'media',
    id: created.id,
    revision: updated.revision,
  });
  expect(published.publishedVersionId).toBe(updated.versionId);
  expect(published.file).toBeUndefined();
});
it('rechecks document read permission when inspecting an unbound first-file upload without requiring an old file', async () => {
  const access = { allowed: true };
  const kit = await fixture((media) => {
    if (!media.upload) throw new Error('Upload missing');
    media.upload.filesRequiredOnCreate = false;
    media.access = {
      'documents.get': {
        version: 'live-read',
        run: ({ actor }) => actor.role.isSuper || access.allowed,
      },
    };
  });
  const doc = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    data: { title: 'Empty' },
  });
  const actor = await contentActor(
    kit,
    [
      'documents.get',
      'documents.update',
      'assets.download',
      'assets.createUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.writeUpload',
    ].map((operation) => `media:${operation}`),
  );
  const session = await kit.assets.api.createUpload(actor.ctx(), {
    collection: 'media',
    purpose: 'replace',
    documentId: doc.id,
    revision: doc.revision,
    filename: 'first.pdf',
    mimeType: 'application/pdf',
    bytes: 5,
  });
  expect(
    (await kit.assets.api.readUpload(actor.ctx(), { collection: 'media', uploadId: session.id }))
      .status,
  ).toBe('pending');
  access.allowed = false;
  await expect(
    kit.assets.api.readUpload(actor.ctx(), { collection: 'media', uploadId: session.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});
