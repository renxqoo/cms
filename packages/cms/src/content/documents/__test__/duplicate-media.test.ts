import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createContentMediaFixture,
  mediaCollections,
  readyContentUpload,
} from '../../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../../test/support/content-media-runtime.ts';
import { contentCollection } from '../../../../../../test/support/content-runtime.ts';
let fixture: ContentMediaFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
it('copies fresh shared row paths with fixed original media bytes after replacement and survives source revision pruning and asset cleanup', async () => {
  const collections = mediaCollections();
  const article = contentCollection(collections, 'articles');
  article.history = { maxVersions: 1, retentionMs: 0 };
  article.fields = [
    ...article.fields,
    {
      id: 'gallery',
      name: 'gallery',
      type: 'array',
      fields: [
        { id: 'gallery_image', name: 'image', type: 'upload', relationTo: ['media'] },
        { id: 'gallery_caption', name: 'caption', type: 'text', localized: true },
      ],
    },
  ];
  contentCollection(collections, 'media').history = { maxVersions: 1, retentionMs: 0 };
  const kit = await createContentMediaFixture({ collections });
  fixture = kit;
  const original = new TextEncoder().encode('%PDF-1.7\nOriginal bound snapshot\n%%EOF');
  const initial = await readyContentUpload(kit, { bytes: original });
  const media = await kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: initial.uploadId,
    data: { title: 'Media' },
  });
  const row = '10000000-0000-4000-8000-000000000010';
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: {
        title: 'English',
        gallery: [{ id: row, image: { collection: 'media', id: media.id }, caption: 'EN' }],
      },
      zh: {
        title: '中文',
        gallery: [{ id: row, image: { collection: 'media', id: media.id }, caption: '中文' }],
      },
    },
  });
  const nextBytes = new TextEncoder().encode('%PDF-1.7\nReplacement current bytes\n%%EOF');
  const next = await readyContentUpload(kit, {
    bytes: nextBytes,
    target: { documentId: media.id, revision: media.revision },
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'media',
    id: media.id,
    revision: media.revision,
    uploadId: next.uploadId,
  });
  const copied = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
  });
  const newRow = z.array(z.object({ id: z.uuid() })).parse(copied.data['gallery'])[0]?.id;
  expect(newRow).not.toBe(row);
  const chinese = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: copied.id,
    locale: 'zh',
    fallback: [],
  });
  expect(chinese.data['gallery']).toMatchObject([{ id: newRow, caption: '中文' }]);
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    data: { gallery: [] },
  });
  expect(
    (await kit.database.query('SELECT 1 FROM content_revisions WHERE id=$1', [source.versionId]))
      .rowCount,
  ).toBe(0);
  await kit.database.query(
    "UPDATE asset_manifests SET retain_until=clock_timestamp()-interval '1 hour'",
  );
  await kit.database.query(
    "UPDATE asset_objects SET retain_until=clock_timestamp()-interval '1 hour'",
  );
  await kit.assets.maintenance();
  for (const document of [copied, chinese]) {
    const binding = document.mediaBindings?.find((entry) =>
      entry.sourcePath.endsWith(`gallery.${newRow}.image`),
    );
    if (!binding) throw new Error('Copied fixed binding missing');
    const file = await kit.assets.api.download(kit.owner(), {
      collection: 'articles',
      id: copied.id,
      bindingId: binding.bindingId,
      locale: document === chinese ? 'zh' : 'en',
    });
    expect(new Uint8Array(await new Response(file.stream).arrayBuffer())).toEqual(original);
  }
  const current = await kit.assets.api.download(kit.owner(), { collection: 'media', id: media.id });
  expect(new Uint8Array(await new Response(current.stream).arrayBuffer())).toEqual(nextBytes);
});
