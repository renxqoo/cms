import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
  contentField,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture() {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.localizeStatus = true;
  articles.fields = [
    ...articles.fields,
    {
      id: 'group',
      name: 'group',
      type: 'group',
      fields: [{ id: 'caption', name: 'caption', type: 'text', localized: true }],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [{ id: 'row_text', name: 'text', type: 'text', localized: true }],
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}

it('returns localized maps in nested groups and stable array rows without applying a fallback translation', async () => {
  const kit = await fixture();
  const row = '10000000-0000-4000-8000-000000000077';
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', group: { caption: 'EN' }, rows: [{ id: row, text: 'Row' }] },
      zh: { title: '中文', group: { caption: 'ZH' }, rows: [{ id: row, text: '行' }] },
    },
  });
  const all = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    locale: 'all',
  });
  expect(all.data).toMatchObject({
    title: { en: 'English', zh: '中文' },
    group: { caption: { en: 'EN', zh: 'ZH' } },
    rows: [{ id: row, text: { en: 'Row', zh: '行' } }],
  });
  const list = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    locale: 'all',
    select: ['title'],
  });
  expect(list.rows[0]?.data).toEqual({ title: { en: 'English', zh: '中文' } });
  await expect(
    kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      locale: 'all',
      fallback: ['en'],
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('reads each language publication snapshot and historical locale data while current drafts remain private', async () => {
  const kit = await fixture();
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'English v1' },
  });
  const english = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    locale: 'en',
  });
  const chinese = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: english.revision,
    locale: 'zh',
    data: { title: '中文 v2' },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: chinese.revision,
    locale: 'zh',
  });
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    locale: 'en',
    data: { title: 'Private v3' },
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        locale: 'all',
        mode: 'published',
      })
    ).data['title'],
  ).toEqual({ en: 'English v1', zh: '中文 v2' });
  expect(
    (
      await kit.content.api.getVersion(kit.owner(), {
        collection: 'articles',
        id: first.id,
        versionId: first.versionId,
        locale: 'all',
      })
    ).data['title'],
  ).toEqual({ en: 'English v1' });
});

it('rechecks row and field read permissions for every returned locale instead of reusing the default language decision', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  contentField(articles, 'title').access = {
    read: { version: 'locale', run: ({ locale }) => locale !== 'zh' },
  };
  articles.access = {
    'documents.list': { version: 'locale', run: ({ locale }) => locale !== 'zh' },
    'documents.get': { version: 'locale', run: ({ locale }) => locale !== 'zh' },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: { en: { title: 'Allowed' }, zh: { title: 'Private' } },
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        locale: 'all',
      })
    ).data['title'],
  ).toEqual({ en: 'Allowed' });
  const list = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    locale: 'all',
    sort: [{ field: 'id', order: 'asc' }],
  });
  expect(list.total).toBe(1);
  expect(list.rows[0]?.data['title']).toEqual({ en: 'Allowed' });
});

it('regression: all-language reads do not sort their internal id lookup by a field hidden in another language', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  contentField(articles, 'title').access = {
    read: { version: 'private-translation', run: ({ locale }) => locale !== 'zh' },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: { en: { title: 'Visible' }, zh: { title: 'Hidden' } },
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        locale: 'all',
      })
    ).data['title'],
  ).toEqual({ en: 'Visible' });
});

it('combines localized target values inside the uniform join page without changing its paging contract', async () => {
  const collections = workflowCollections();
  const pages = contentCollection(collections, 'pages');
  pages.fields = [
    ...pages.fields,
    {
      id: 'inverse',
      name: 'articles',
      type: 'join',
      join: { collection: 'articles', field: 'related' },
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const parent = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Parent' },
  });
  const related = [{ collection: 'pages', id: parent.id }];
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: { en: { title: 'English', related }, zh: { title: '中文', related } },
  });
  const all = await kit.content.api.getDocument(kit.owner(), {
    collection: 'pages',
    id: parent.id,
    locale: 'all',
    depth: 1,
  });
  expect(all.data['articles']).toMatchObject({
    page: 1,
    hasNextPage: false,
    rows: [{ data: { title: { en: 'English', zh: '中文' } } }],
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'pages',
        id: parent.id,
        locale: 'all',
        joins: false,
      })
    ).data,
  ).not.toHaveProperty('articles');
});
