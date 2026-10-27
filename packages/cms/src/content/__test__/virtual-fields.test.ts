import { afterEach, expect, it } from 'vitest';
import { createContent } from '../composition.ts';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture(hidden = false, maxExpandNodes?: number) {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.admin = {
    useAsTitle: 'display',
    defaultColumns: ['display', 'score'],
    description: 'Configured collection',
  };
  articles.fields = [
    ...articles.fields,
    {
      id: 'display',
      name: 'display',
      type: 'text',
      virtual: {
        version: 'upper',
        run: ({ data }) =>
          Promise.resolve(typeof data?.['title'] === 'string' ? data['title'].toUpperCase() : ''),
      },
    },
    { id: 'title_copy', name: 'titleCopy', type: 'text', virtual: 'title' },
    {
      id: 'related_titles',
      name: 'relatedTitles',
      type: 'json' as const,
      virtual: 'related.title',
    },
  ];
  const pages = contentCollection(collections, 'pages');
  pages.fields = [
    ...pages.fields,
    {
      id: 'articles',
      name: 'articles',
      type: 'join' as const,
      join: { collection: 'articles', field: 'related' },
    },
    {
      id: 'article_titles',
      name: 'articleTitles',
      type: 'json' as const,
      virtual: 'articles.title',
    },
  ].map((field) =>
    hidden && field.name === 'title'
      ? { ...field, access: { read: { version: 'hidden', run: () => false } } }
      : field,
  );
  const kit = await createContentFixture({
    collections,
    compose(options) {
      const configured = {
        ...options,
        limits: { ...options.limits, ...(maxExpandNodes === undefined ? {} : { maxExpandNodes }) },
      };
      const content = createContent(configured);
      return { content, options: configured, close: () => content.close() };
    },
  });
  fixtures.push(kit);
  return kit;
}

it('computes async and path virtuals for detail, list and inverse joins at depth zero without accepting writes', async () => {
  const kit = await fixture();
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Page' },
  });
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Article', related: [{ collection: 'pages', id: page.id }] },
  });
  expect(article.data).toMatchObject({
    display: 'ARTICLE',
    titleCopy: 'Article',
    relatedTitles: ['Page'],
  });
  const listed = await kit.content.api.listDocuments(kit.owner(), {
    collection: 'articles',
    depth: 0,
    select: ['display', 'relatedTitles'],
  });
  expect(listed.rows[0]?.data).toEqual({ display: 'ARTICLE', relatedTitles: ['Page'] });
  const inverse = await kit.content.api.getDocument(kit.owner(), {
    collection: 'pages',
    id: page.id,
    depth: 0,
  });
  expect(inverse.data['articleTitles']).toEqual(['Article']);
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: article.id,
      revision: article.revision,
      data: { display: 'Overwrite' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      where: { field: 'display', operator: 'eq', value: 'ARTICLE' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const metadata = await kit.content.api.getCollection(kit.owner(), { collection: 'articles' });
  expect(metadata.admin).toEqual({
    hidden: false,
    disableCopyToLocale: false,
    enableRichTextLink: true,
    enableRichTextRelationship: true,
    useAsTitle: 'display',
    defaultColumns: ['display', 'score'],
    description: 'Configured collection',
  });
});

it('regression: relationship virtual paths never expose a target field denied by its own read policy', async () => {
  const kit = await fixture(true);
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Private page title' },
  });
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Public', related: [{ collection: 'pages', id: page.id }] },
  });
  expect(article.data['relatedTitles']).toEqual([]);
  expect(JSON.stringify(article)).not.toContain('Private page title');
});

it('relationship virtuals and ordinary expansion share the request node budget', async () => {
  const kit = await fixture(false, 3);
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Page' },
  });
  const second = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Second page' },
  });
  const article = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Article',
      related: [
        { collection: 'pages', id: page.id },
        { collection: 'pages', id: second.id },
      ],
    },
  });
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: article.id, depth: 1 }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
});
