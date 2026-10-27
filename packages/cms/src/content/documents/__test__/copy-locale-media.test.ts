import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { contentCollection } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentMediaFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
it('copies the fixed source file into translated and regenerated row paths after the media file has been replaced, and fails closed for missing source bindings', async () => {
  const collections = mediaCollections();
  const article = contentCollection(collections, 'articles');
  article.fields = [
    ...article.fields.map((field) =>
      field.name === 'cover' ? { ...field, localized: true } : field,
    ),
    {
      id: 'gallery',
      name: 'gallery',
      type: 'array',
      localized: true,
      fields: [{ id: 'gallery_image', name: 'image', type: 'upload', relationTo: ['media'] }],
    },
  ];
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  const original = new TextEncoder().encode('%PDF-1.7\noriginal locale bytes\n%%EOF');
  const firstUpload = await readyContentUpload(kit, { bytes: original });
  const media = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: firstUpload.uploadId,
    data: { title: 'Original' },
  });
  const row = '10000000-0000-4000-8000-000000000099';
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: {
        title: 'Source',
        cover: { collection: 'media', id: media.id },
        gallery: [{ id: row, image: { collection: 'media', id: media.id } }],
      },
      zh: { title: 'Target' },
    },
  });
  const replacement = new TextEncoder().encode('%PDF-1.7\nreplacement media bytes\n%%EOF');
  const upload = await readyContentUpload(kit, {
    bytes: replacement,
    target: { documentId: media.id, revision: media.revision },
  });
  const changed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'media',
    id: media.id,
    revision: media.revision,
    uploadId: upload.uploadId,
  });
  expect(changed.file?.digest).not.toBe(media.file?.digest);
  const copied = await kit.content.api.copyLocale(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    fromLocale: 'en',
    toLocale: 'zh',
  });
  const gallery = z.array(z.object({ id: z.uuid() })).parse(copied.data['gallery']);
  expect(gallery[0]?.id).not.toBe(row);
  const paths = copied.mediaBindings
    ?.map((binding) => binding.sourcePath)
    .toSorted((a, b) => a.localeCompare(b));
  expect(paths).toEqual(['zh:cover', `zh:gallery.${gallery[0]?.id}.image`]);
  for (const binding of copied.mediaBindings ?? []) {
    expect(binding.manifest.digest).toBe(media.file?.digest);
    const download = await kit.assets.api.download(kit.owner(), {
      collection: 'articles',
      id: source.id,
      locale: 'zh',
      bindingId: binding.bindingId,
    });
    expect(new Uint8Array(await new Response(download.stream).arrayBuffer())).toEqual(original);
  }
  const english = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    locale: 'en',
    fallback: [],
  });
  expect(
    english.mediaBindings
      ?.map((binding) => binding.sourcePath)
      .toSorted((a, b) => a.localeCompare(b)),
  ).toEqual(['en:cover', `en:gallery.${row}.image`]);
  await kit.database.query(
    "DELETE FROM asset_references WHERE revision_id=$1 AND source_path LIKE 'en:%'",
    [copied.versionId],
  );
  await expect(
    kit.content.api.copyLocale(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: copied.revision,
      fromLocale: 'en',
      toLocale: 'zh',
      overwrite: true,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: source.id,
        locale: 'zh',
      })
    ).revision,
  ).toBe(copied.revision);
});
