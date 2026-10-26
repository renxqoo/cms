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
