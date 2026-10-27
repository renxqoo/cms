import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture() {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('publishes languages independently and filters each published list against its own immutable snapshot', async () => {
  const kit = await fixture();
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'English public' },
  });
  const english = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
    locale: 'en',
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      locale: 'zh',
      mode: 'published',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(
    await kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      locale: 'zh',
      mode: 'published',
    }),
  ).toMatchObject({ total: 0, rows: [] });
  const chineseDraft = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: english.revision,
    dataByLocale: { en: { title: 'English private' }, zh: { title: '中文发布' } },
  });
  const chinese = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: chineseDraft.revision,
    locale: 'zh',
  });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      locale: 'en',
      mode: 'published',
    }),
  ).toMatchObject({ data: { title: 'English public' }, versionId: english.versionId });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      locale: 'zh',
      mode: 'published',
    }),
  ).toMatchObject({ data: { title: '中文发布' }, versionId: chinese.versionId });
  expect(
    await kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      locale: 'en',
      mode: 'published',
      where: { field: 'title', operator: 'eq', value: 'English private' },
    }),
  ).toMatchObject({ total: 0, rows: [] });
  const withdrawn = await kit.content.api.unpublishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: chinese.revision,
    locale: 'zh',
  });
  expect(withdrawn.publishedVersionId).toBeNull();
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      locale: 'en',
      mode: 'published',
    }),
  ).toMatchObject({ data: { title: 'English public' } });
});

it('protects every language publication from history pruning and clears all publications on archive', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Old English' },
  });
  let current = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'en',
  });
  for (let index = 0; index < 5; index += 1)
    current = await kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: current.revision,
      locale: 'zh',
      data: { title: `中文 ${index}` },
    });
  current = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: current.revision,
    locale: 'zh',
  });
  await kit.content.maintenance();
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      locale: 'en',
      mode: 'published',
    }),
  ).toMatchObject({ data: { title: 'Old English' }, versionId: first.versionId });
  await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: current.revision,
  });
  const publications = await kit.database.query(
    'SELECT version_id FROM content_publications WHERE document_id=$1',
    [first.id],
  );
  expect(publications.rowCount).toBe(0);
});

it('validates only the language being published and keeps unfilled translations unpublished', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  articles.locales = { default: 'en', supported: ['en', 'zh'], fallback: {} };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'English' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: draft.id,
    revision: draft.revision,
    locale: 'en',
  });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: published.revision,
      locale: 'zh',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      locale: 'en',
      mode: 'published',
    }),
  ).toMatchObject({ versionId: draft.versionId });
});

it('reserves only the actual published locale values and releases never-published translations from old snapshots', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  articles.fields = articles.fields.map((field) =>
    field.name === 'slug' ? { ...field, localized: true } : field,
  );
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', slug: 'en-old' },
      zh: { title: '中文', slug: 'zh-never-published' },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'en',
  });
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    dataByLocale: { en: { slug: 'en-current' }, zh: { slug: 'zh-current' } },
  });
  await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: updated.revision,
    locale: 'zh',
  });
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      locale: 'en',
      data: { title: 'Conflict', slug: 'en-old' },
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
  expect(
    await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      locale: 'zh',
      data: { title: '可用', slug: 'zh-never-published' },
    }),
  ).toMatchObject({ data: { slug: 'zh-never-published' } });
});

it('does not treat a never-published translation reference as active when another language uses the old revision', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  articles.fields = articles.fields.map((field) =>
    field.name === 'related' ? { ...field, localized: true } : field,
  );
  const kit = await createContentFixture({ collections, trashRetentionMs: 0 });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Historical target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English public', related: [] },
      zh: { title: '中文草稿', related: [{ collection: 'pages', id: target.id }] },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    locale: 'en',
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: published.revision,
    locale: 'zh',
    data: { related: [] },
  });
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: target.id,
    revision: target.revision,
  });
  expect(archived.trashedAt).not.toBeNull();
  await expect(
    kit.content.api.purgeDocument(kit.owner(), {
      collection: 'pages',
      id: target.id,
      revision: archived.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
});

it('does not activate references from languages omitted by publicationLocalesField', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.publicationLocalesField = 'contentLocales';
  articles.fields = [
    ...articles.fields.map((field) =>
      field.name === 'related' ? { ...field, localized: true } : field,
    ),
    {
      id: 'content_locales',
      name: 'contentLocales',
      type: 'select',
      options: ['en', 'zh'],
      hasMany: true,
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Only Chinese draft' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', contentLocales: ['en'], related: [] },
      zh: { title: 'Chinese', related: [{ collection: 'pages', id: target.id }] },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: published.revision,
    locale: 'zh',
    data: { related: [] },
  });
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: target.id,
    revision: target.revision,
  });
  expect(archived.id).toBe(target.id);
  expect(archived.trashedAt).toBeTypeOf('string');
});

it('keeps a fallback reference active for its published language after the working draft removes it', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  articles.fields = articles.fields.map((field) =>
    field.name === 'related' ? { ...field, localized: true } : field,
  );
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Fallback target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    locale: 'en',
    data: { title: 'Fallback source', related: [{ collection: 'pages', id: target.id }] },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    locale: 'zh',
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: published.revision,
    locale: 'en',
    data: { related: [] },
  });
  await expect(
    kit.content.api.archiveDocument(kit.owner(), {
      collection: 'pages',
      id: target.id,
      revision: target.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  const references = await kit.content.api.listReferences(kit.owner(), {
    collection: 'pages',
    id: target.id,
  });
  expect(references.rows).toContainEqual({
    collection: 'articles',
    id: source.id,
    versionId: source.versionId,
    sourcePath: 'zh:related.0',
  });
  await kit.content.api.unpublishDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: published.revision + 1,
    locale: 'zh',
  });
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: target.id,
    revision: target.revision,
  });
  expect(archived.id).toBe(target.id);
  expect(archived.trashedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

it('does not reserve an unused fallback language reference when the published translation has an explicit value', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  articles.fields = articles.fields.map((field) =>
    field.name === 'related' ? { ...field, localized: true } : field,
  );
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Unused fallback target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', related: [{ collection: 'pages', id: target.id }] },
      zh: { title: '中文', related: [] },
    },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: source.revision,
    locale: 'zh',
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    revision: published.revision,
    locale: 'en',
    data: { related: [] },
  });
  const archived = await kit.content.api.archiveDocument(kit.owner(), {
    collection: 'pages',
    id: target.id,
    revision: target.revision,
  });
  expect(archived.id).toBe(target.id);
  expect(archived.trashedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
});

it('rechecks reference read permission separately for every language of a global publication', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  const pages = collections.find((collection) => collection.key === 'pages');
  if (!articles || !pages) throw new Error('Missing collections fixture');
  articles.fields = articles.fields.map((field) =>
    field.name === 'related' ? { ...field, localized: true } : field,
  );
  let chineseReadable = true;
  pages.access = {
    'documents.get': {
      version: 'locale-read-v1',
      run: ({ locale }) => locale !== 'zh' || chineseReadable,
    },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Language restricted target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', related: [] },
      zh: { title: '中文', related: [{ collection: 'pages', id: target.id }] },
    },
  });
  chineseReadable = false;
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      revision: source.revision,
      locale: 'en',
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: source.id }),
  ).toMatchObject({ revision: source.revision, publishedVersionId: null });
});
