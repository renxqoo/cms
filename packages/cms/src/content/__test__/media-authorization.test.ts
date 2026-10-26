import { createContent, createContentSchemaMigrator } from '../composition.ts';
import { createRegistry, generateEvolution } from '../generate.ts';
import { contentOperations } from '../operations.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { contentCollection } from '../../../../../test/support/content-runtime.ts';
import { afterEach, expect, it } from 'vitest';
import {
  createContentMediaFixture,
  mediaCollections,
} from '../../../../../test/support/content-media-runtime.ts';
import type { ContentMediaFixture } from '../../../../../test/support/content-media-runtime.ts';
import { contentActor } from '../../../../../test/support/content-actor.ts';

const fixtures: ContentMediaFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(collections = mediaCollections()) {
  const kit = await createContentMediaFixture({ collections });
  fixtures.push(kit);
  return kit;
}
const original = new TextEncoder().encode('%PDF-1.7\nprivate original bytes\n%%EOF');
function stream(bytes: Uint8Array) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}
async function upload(
  kit: ContentMediaFixture,
  bytes = original,
  target?: { documentId: string; revision: number },
) {
  const created = await kit.assets.api.createUpload(kit.owner(), {
    collection: 'media',
    purpose: target ? 'replace' : 'create',
    filename: 'original.pdf',
    mimeType: 'application/pdf',
    bytes: bytes.byteLength,
    ...target,
  });
  await kit.assets.api.writeUpload(
    kit.owner(),
    { collection: 'media', uploadId: created.id },
    stream(bytes),
  );
  await kit.assets.api.completeUpload(kit.owner(), { collection: 'media', uploadId: created.id });
  await kit.assets.maintenance();
  expect(
    (await kit.assets.api.readUpload(kit.owner(), { collection: 'media', uploadId: created.id }))
      .status,
  ).toBe('ready');
  return created.id;
}
async function media(kit: ContentMediaFixture) {
  return kit.content.api.createDocument(kit.owner(), {
    collection: 'media',
    uploadId: await upload(kit),
    data: { title: 'Private media' },
  });
}

it('rechecks source row, field and target download policies for every fixed binding download', async () => {
  const collections = mediaCollections();
  let showCover = true;
  let allowDownload = true;
  contentCollection(collections, 'articles').access = {
    'documents.get': {
      version: '1',
      run: ({ actor }) => actor.role.isSuper || { field: 'score', operator: 'gte', value: 10 },
    },
  };
  contentCollection(collections, 'articles').fields = contentCollection(
    collections,
    'articles',
  ).fields.map((field) =>
    field.name === 'cover'
      ? {
          ...field,
          access: { read: { version: '1', run: ({ actor }) => actor.role.isSuper || showCover } },
        }
      : field,
  );
  contentCollection(collections, 'media').access = {
    'assets.download': { version: '1', run: ({ actor }) => actor.role.isSuper || allowDownload },
  };
  const kit = await fixture(collections);
  const file = await media(kit);
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Article', score: 10, cover: { collection: 'media', id: file.id } },
  });
  const bindingId = article.mediaBindings?.[0]?.bindingId;
  if (!bindingId) throw new Error('Missing fixed binding');
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:assets.downloadBinding',
    'articles:versions.get',
    'media:documents.get',
    'media:assets.download',
  ]);
  const input = { collection: 'articles', id: article.id, bindingId };
  const downloaded = await kit.assets.api.download(editor.ctx(), input);
  expect(new Uint8Array(await new Response(downloaded.stream).arrayBuffer())).toEqual(original);
  showCover = false;
  const hidden = await kit.content.api.getDocument(editor.ctx(), {
    collection: 'articles',
    id: article.id,
  });
  expect(hidden.data['cover']).toBeUndefined();
  expect(hidden.mediaBindings).toEqual([]);
  await expect(kit.assets.api.download(editor.ctx(), input)).rejects.toMatchObject({
    code: 'not_found',
  });
  showCover = true;
  allowDownload = false;
  await expect(kit.assets.api.download(editor.ctx(), input)).rejects.toMatchObject({
    code: 'forbidden',
  });
  allowDownload = true;
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: article.id,
    revision: article.revision,
    data: { score: 0 },
  });
  await expect(
    kit.assets.api.download(editor.ctx(), { ...input, versionId: article.versionId }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it('keeps historical fixed files reusable after their media revision is pruned and rejects foreign bindings', async () => {
  const collections = mediaCollections();
  contentCollection(collections, 'media').history = { maxVersions: 1, retentionMs: 0 };
  const kit = await fixture(collections);
  const file = await media(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Bound old file', cover: { collection: 'media', id: file.id } },
  });
  const bindingId = first.mediaBindings?.[0]?.bindingId;
  if (!bindingId) throw new Error('Missing fixed binding');
  const other = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Other article' },
  });
  await expect(
    kit.assets.api.download(kit.owner(), { collection: 'articles', id: other.id, bindingId }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const replacement = new TextEncoder().encode('%PDF-1.7\nreplacement bytes\n%%EOF');
  const next = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'media',
    id: file.id,
    revision: file.revision,
    uploadId: await upload(kit, replacement, { documentId: file.id, revision: file.revision }),
  });
  expect(next.file?.digest).not.toBe(file.file?.digest);
  await expect(
    kit.content.api.getVersion(kit.owner(), {
      collection: 'media',
      id: file.id,
      versionId: file.versionId,
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
  });
  const copiedBinding = copy.mediaBindings?.[0]?.bindingId;
  if (!copiedBinding) throw new Error('Missing copied fixed binding');
  const bytes = await kit.assets.api.download(kit.owner(), {
    collection: 'articles',
    id: copy.id,
    bindingId: copiedBinding,
  });
  expect(new Uint8Array(await new Response(bytes.stream).arrayBuffer())).toEqual(original);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'media',
      manifestId: file.file?.id,
      data: { title: 'Injected manifest' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const mediaCopy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'media',
    id: next.id,
    revision: next.revision,
  });
  expect(mediaCopy.file?.digest).toBe(next.file?.digest);
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'media',
        id: mediaCopy.id,
        locale: 'zh',
      })
    ).data['title'],
  ).toBe('Private media');
});

it('does not download another language binding through an allowed default-language document', async () => {
  const collections = mediaCollections();
  contentCollection(collections, 'articles').fields = contentCollection(
    collections,
    'articles',
  ).fields.map((field) => (field.name === 'cover' ? { ...field, localized: true } : field));
  contentCollection(collections, 'articles').access = {
    'documents.get': {
      version: '1',
      run: ({ actor, locale }) => actor.role.isSuper || locale === 'en',
    },
  };
  const kit = await fixture(collections);
  const file = await media(kit);
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English' },
      zh: { title: '中文私有', cover: { collection: 'media', id: file.id } },
    },
  });
  const chinese = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    locale: 'zh',
  });
  const bindingId = chinese.mediaBindings?.[0]?.bindingId;
  if (!bindingId) throw new Error('Missing Chinese binding');
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:assets.downloadBinding',
    'media:documents.get',
    'media:assets.download',
  ]);
  await expect(
    kit.assets.api.download(editor.ctx(), { collection: 'articles', id: source.id, bindingId }),
  ).rejects.toMatchObject({ code: 'forbidden' });
});

it('maps renamed field and locale bindings when copying a migrated historical revision', async () => {
  const kit = await fixture();
  const file = await media(kit);
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Before rename', cover: { collection: 'media', id: file.id } },
  });
  const history = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: source.id,
    versionId: source.versionId,
  });
  const collections = mediaCollections();
  const articles = contentCollection(collections, 'articles');
  const previous = structuredClone(articles);
  articles.schemaVersion = 2;
  articles.previousSchemas = [previous];
  articles.locales = {
    default: 'en-US',
    supported: ['en-US', 'zh-CN'],
    fallback: { 'zh-CN': ['en-US'] },
  };
  articles.fields = articles.fields.map((field) =>
    field.name === 'cover' ? { ...field, name: 'image' } : field,
  );
  articles.migrations = [
    {
      from: 1,
      version: '1',
      localeMap: { 'en-US': 'en', 'zh-CN': 'zh' },
      transform: (data) => {
        const { cover, ...rest } = data;
        return { ...rest, ...(cover === undefined ? {} : { image: cover }) };
      },
    },
  ];
  const registry = createRegistry({
    collections,
    limits: kit.limits,
    operations: [...contentOperations, ...assetsOperations],
  });
  const evolution = generateEvolution({ previous: kit.artifacts.snapshot, registry });
  expect(evolution.requiresManualMigration).toBe(false);
  await kit.database.query(evolution.sql);
  const migration = createContentSchemaMigrator({
    database: kit.database,
    registry,
    mapping: evolution.mapping,
    limits: kit.limits,
    policy: kit.policy,
    resourceLockKey: kit.contentOptions.workPolicy.resourceLockKey,
  });
  let result = await migration.backfill({ collection: 'articles', from: 1, to: 2, pageSize: 10 });
  while (!result.complete)
    result = await migration.backfill({
      collection: 'articles',
      from: 1,
      to: 2,
      pageSize: 10,
      ...(result.cursor ? { cursor: result.cursor } : {}),
    });
  await migration.activate();
  const migrated = createContent({ ...kit.contentOptions, registry, mapping: evolution.mapping });
  try {
    const read = await migrated.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
    });
    expect(read.data['image']).toEqual({ collection: 'media', id: file.id });
    expect(read.mediaBindings?.[0]?.manifest.id).toBe(file.file?.id);
    const copy = await migrated.api.copyDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: source.revision,
    });
    const bindingId = copy.mediaBindings?.[0]?.bindingId;
    if (!bindingId) throw new Error('Missing migrated copy binding');
    const authorized = await securityTransaction(kit.database, kit.policy, {
      mode: 'shared',
      async work(tx) {
        const actor = await kit.access.authorizeActor(tx, {
          actor: { id: history.actorId, delegationId: null },
          operationId: 'assets.downloadBinding',
          scope: { scopeKind: 'collection', collectionKey: 'articles' },
        });
        return migrated.authorizeMedia(tx, {
          actor,
          operationId: 'assets.downloadBinding',
          action: 'download',
          collectionKey: 'articles',
          documentId: copy.id,
          bindingId,
        });
      },
    });
    expect(authorized.manifestId).toBe(file.file?.id);
  } finally {
    await migrated.close();
  }
});
