import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('retains rich-text formatting, ordered lists and quotations in published and restored historical snapshots', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing article configuration');
  articles.fields = [
    ...articles.fields,
    { id: 'body', name: 'body', type: 'richText', localized: true },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const body = {
    version: 1,
    children: [
      {
        type: 'heading',
        level: 3,
        children: [{ type: 'text', text: 'History', format: ['bold', 'italic'] }],
      },
      {
        type: 'list',
        kind: 'number',
        start: 5,
        children: [{ type: 'listItem', children: [{ type: 'text', text: 'Fifth' }] }],
      },
      { type: 'quote', align: 'right', indent: 1, children: [{ type: 'text', text: 'Quoted' }] },
      { type: 'horizontalRule' },
    ],
  };
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Rich history', body },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
  });
  const changed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: published.revision,
    data: {
      body: {
        version: 1,
        children: [{ type: 'paragraph', children: [{ type: 'text', text: 'New draft' }] }],
      },
    },
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: created.id,
        mode: 'published',
      })
    ).data['body'],
  ).toEqual(body);
  expect(
    (
      await kit.content.api.getVersion(kit.owner(), {
        collection: 'articles',
        id: created.id,
        versionId: created.versionId,
      })
    ).data['body'],
  ).toEqual(body);
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'articles',
    id: created.id,
    versionId: created.versionId,
    revision: changed.revision,
  });
  expect(restored.data['body']).toEqual(body);
  expect(restored.versionId).not.toBe(created.versionId);
});

it('internal document links survive history, copies and publication and participate in target deletion checks', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  const pages = collections.find((collection) => collection.key === 'pages');
  if (!articles || !pages) throw new Error('Missing configuration');
  articles.fields = [
    ...articles.fields,
    { id: 'body', name: 'body', type: 'richText', localized: true },
  ];
  articles.admin = {
    description: { en: 'English description', zh: '中文描述' },
    meta: {
      title: { en: 'Article page', zh: '文章页面' },
      titleSuffix: { en: ' — Desk', zh: ' — 管理' },
      openGraph: { type: 'article' },
    },
  };
  pages.admin = { enableRichTextLink: false };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const catalog = await kit.content.api.getCollection(kit.owner(), {
    collection: 'articles',
    locale: 'zh',
  });
  expect(catalog.admin.description).toBe('中文描述');
  expect(catalog.admin.meta).toMatchObject({
    title: '文章页面',
    titleSuffix: ' — 管理',
    openGraph: { type: 'article' },
  });
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Target' },
  });
  const body = {
    version: 1,
    children: [
      {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            reference: { collection: 'pages', id: target.id },
            children: [{ type: 'text', text: 'Linked document', format: ['bold'] }],
          },
        ],
      },
    ],
  };
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Internal link', body },
  });
  expect(created.data['body']).toEqual(body);
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
  });
  expect(copy.data['body']).toEqual(body);
  const history = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: created.id,
    versionId: created.versionId,
    depth: 0,
  });
  expect(history.data['body']).toEqual(body);
  await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
  });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: created.id,
        mode: 'published',
        depth: 0,
      })
    ).data['body'],
  ).toEqual(body);
  await expect(
    kit.content.api.archiveDocument(kit.owner(), {
      collection: 'pages',
      id: target.id,
      revision: target.revision,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'pages', id: target.id })).data[
      'title'
    ],
  ).toBe('Target');
});
