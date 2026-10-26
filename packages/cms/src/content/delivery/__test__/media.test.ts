import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../../test/support/content-media-runtime.ts';
import {
  publicCollections,
  publicDeliveryOptions,
} from '../../../../../../test/support/public-content.ts';
import {
  initializePublicFixture,
  createPublicModel,
} from '../../../../../../test/support/public-runtime.ts';
const fixtures: Awaited<ReturnType<typeof createContentMediaFixture>>[] = [];
async function fixture() {
  const collections = publicCollections();
  const models = collections.find(({ key }) => key === 'models');
  const media = mediaCollections().find(({ key }) => key === 'media');
  if (!models || !media) throw new Error('Fixture collection missing');
  models.fields = [
    ...models.fields,
    { id: 'logo', name: 'logo', type: 'upload', relationTo: ['media'] },
  ];
  collections.push(media);
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  await initializePublicFixture(kit);
  return { ...kit, delivery: kit.content.createDelivery(publicDeliveryOptions()) };
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('serves only the binding referenced by a currently published allowed source and revokes it on unpublish', async () => {
  const kit = await fixture();
  const bytes = new TextEncoder().encode('%PDF-1.7\nknown public document\n%%EOF');
  const upload = await readyContentUpload(kit, { bytes });
  const media = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: upload.uploadId,
    data: { title: 'Published logo' },
  });
  const draft = await createPublicModel(
    kit,
    { logo: { collection: 'media', id: media.id } },
    false,
  );
  const ticket = await kit.delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: draft.id,
    locale: 'en',
    expectedRevision: draft.revision,
  });
  const grant = new URL(ticket.url).searchParams.get('grant');
  if (!grant) throw new Error('Missing grant');
  const preview = await kit.delivery.getPreviewModel({ slug: 'alpha', locale: 'en', grant });
  const bindingId = preview.content.data.model.logo?.bindingId;
  if (!bindingId) throw new Error('Missing bound logo');
  await expect(kit.delivery.getPublicMedia({ bindingId })).rejects.toMatchObject({
    code: 'not_found',
  });
  const privateFile = await kit.delivery.getPreviewMedia({ bindingId, grant });
  expect(new Uint8Array(await new Response(privateFile.stream).arrayBuffer())).toEqual(bytes);
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'models',
    id: draft.id,
    revision: draft.revision,
  });
  const publicFile = await kit.delivery.getPublicMedia({ bindingId });
  expect(new Uint8Array(await new Response(publicFile.stream).arrayBuffer())).toEqual(bytes);
  expect(publicFile.digest).toBe(privateFile.digest);
  expect((await kit.delivery.getModel({ slug: 'alpha', locale: 'en' })).data.model.logo?.url).toBe(
    `/v1/public/media/${bindingId}`,
  );
  await kit.content.api.unpublishDocument(kit.owner(), {
    collection: 'models',
    id: draft.id,
    revision: published.revision,
  });
  await expect(kit.delivery.getPublicMedia({ bindingId })).rejects.toMatchObject({
    code: 'not_found',
  });
  const stillPrivate = await kit.delivery.getPreviewMedia({ bindingId, grant });
  await stillPrivate.stream.cancel();
  await kit.delivery.revokePreview({ grant });
  await expect(kit.delivery.getPreviewMedia({ bindingId, grant })).rejects.toMatchObject({
    code: 'unauthenticated',
  });
});

it('never exposes unbound uploaded files or lets another draft grant open a source binding', async () => {
  const kit = await fixture();
  const upload = await readyContentUpload(kit);
  const media = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: upload.uploadId,
    data: { title: 'Private standalone upload' },
  });
  const source = await createPublicModel(
    kit,
    { logo: { collection: 'media', id: media.id } },
    false,
  );
  const sourceView = await kit.content.api.getDocument(kit.owner(), {
    collection: 'models',
    id: source.id,
  });
  const bindingId = sourceView.mediaBindings?.[0]?.bindingId;
  if (!bindingId) throw new Error('Missing fixture binding');
  const other = await createPublicModel(kit, { modelId: 'other-key', slug: 'other' }, false);
  const ticket = await kit.delivery.createPreviewTicket(kit.owner(), {
    collection: 'models',
    id: other.id,
    locale: 'en',
    expectedRevision: other.revision,
  });
  const grant = new URL(ticket.url).searchParams.get('grant');
  if (!grant) throw new Error('Missing grant');
  await expect(kit.delivery.getPreviewMedia({ bindingId, grant })).rejects.toMatchObject({
    code: 'not_found',
  });
  const bindings = await kit.database.readOnlyTransaction((tx) =>
    kit.assets.participants.listBindings(tx, { revisionId: media.versionId }),
  );
  const uploaded = bindings[0]?.bindingId;
  if (!uploaded) throw new Error('Missing original binding');
  await expect(kit.delivery.getPublicMedia({ bindingId: uploaded })).rejects.toMatchObject({
    code: 'not_found',
  });
  await expect(kit.delivery.getPublicMedia({ bindingId: randomUUID() })).rejects.toMatchObject({
    code: 'not_found',
  });
});
