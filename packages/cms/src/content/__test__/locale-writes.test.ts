import { contentCollection, contentField } from '../../../../../test/support/content-runtime.ts';
import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { CollectionDefinition, FieldPolicyContext } from '../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
async function fixture(collections: CollectionDefinition[]) {
  const value = await createContentFixture({ collections });
  fixtures.push(value);
  return value;
}

it('atomically writes, autosaves and copies all translations without relying on a fallback', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.locales.fallback = {};
  contentField(articles, 'slug').localized = true;
  const kit = await fixture(collections);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: { title: 'English', slug: 'en-one' },
      zh: { title: '中文', slug: 'zh-one' },
    },
  });
  const saved = await kit.content.api.autosaveDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    dataByLocale: { en: { title: 'English draft' }, zh: { title: '中文草稿' } },
  });
  const published = await kit.content.api.publishDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: saved.revision,
  });
  const copy = await kit.content.api.copyDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: published.revision,
    dataByLocale: { en: { slug: 'en-copy' }, zh: { slug: 'zh-copy' } },
  });
  expect(copy.data).toMatchObject({ title: 'English draft', slug: 'en-copy' });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: copy.id,
        locale: 'zh',
      })
    ).data,
  ).toMatchObject({ title: '中文草稿', slug: 'zh-copy' });
  const batch = await kit.content.api.createBatch(kit.owner(), {
    collection: 'articles',
    action: 'update',
    items: [
      {
        id: copy.id,
        revision: copy.revision,
        dataByLocale: { en: { title: 'Batch English' }, zh: { title: '批量中文' } },
      },
    ],
  });
  expect(batch.status).toBe('succeeded');
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: copy.id,
        locale: 'zh',
      })
    ).data['title'],
  ).toBe('批量中文');
});

it('applies the same global publication completeness to direct writes and explicit publish', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.locales.fallback = {};
  const pages = contentCollection(collections, 'pages');
  contentField(pages, 'title').localized = true;
  pages.locales.fallback = {};
  const kit = await fixture(collections);
  await expect(
    kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'English only' },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const draft = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'English draft' },
  });
  await expect(
    kit.content.api.publishDocument(kit.owner(), {
      collection: 'articles',
      id: draft.id,
      revision: draft.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    dataByLocale: { en: { title: 'English page' }, zh: { title: '中文页面' } },
  });
  expect(page.publishedVersionId).toBe(page.versionId);
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'pages',
      id: page.id,
      revision: page.revision,
      dataByLocale: {
        en: { title: 'New title', author: null },
        zh: { author: { collection: 'articles', id: draft.id } },
      },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'pages', id: page.id })).revision,
  ).toBe(page.revision);
});

it('preserves protected children during group and stable row edits while rejecting explicit values and deletion', async () => {
  const collections = workflowCollections();
  let showSecret = false;
  const protectedAccess = {
    read: { version: '1', run: () => showSecret },
    write: { version: '1', run: (ctx: FieldPolicyContext) => ctx.operation === 'documents.create' },
  };
  contentCollection(collections, 'articles').fields = [
    ...contentCollection(collections, 'articles').fields,
    {
      id: 'profile',
      name: 'profile',
      type: 'group',
      fields: [
        { id: 'public', name: 'public', type: 'text' },
        { id: 'secret', name: 'secret', type: 'text', access: protectedAccess },
      ],
    },
    {
      id: 'rows',
      name: 'rows',
      type: 'array',
      fields: [
        { id: 'row_public', name: 'public', type: 'text', localized: true },
        { id: 'row_secret', name: 'secret', type: 'text', access: protectedAccess },
      ],
    },
    {
      id: 'blocks',
      name: 'blocks',
      type: 'blocks',
      blocks: [
        {
          id: 'private_block',
          key: 'private',
          label: 'Private',
          fields: [{ id: 'block_secret', name: 'secret', type: 'text', access: protectedAccess }],
        },
        {
          id: 'public_block',
          key: 'public',
          label: 'Public',
          fields: [{ id: 'block_public', name: 'public', type: 'text' }],
        },
      ],
    },
  ];
  const kit = await fixture(collections);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    dataByLocale: {
      en: {
        title: 'Root',
        profile: { public: 'Before', secret: 'Hidden' },
        rows: [{ public: 'English', secret: 'Row hidden' }],
        blocks: [{ blockType: 'private', secret: 'Block hidden' }],
      },
      zh: { rows: [{ public: '中文' }] },
    },
  });
  const { rows } = first.data;
  const { blocks } = first.data;
  if (!Array.isArray(rows) || !Array.isArray(blocks)) throw new Error('Missing row fixtures');
  const [firstRow] = rows;
  const [block] = blocks;
  if (
    !firstRow ||
    typeof firstRow !== 'object' ||
    Array.isArray(firstRow) ||
    !block ||
    typeof block !== 'object' ||
    Array.isArray(block)
  )
    throw new Error('Missing stable IDs');
  const saved = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: {
      profile: { public: 'After' },
      rows: [{ id: firstRow['id'], public: 'English updated' }],
    },
  });
  expect(saved.data['profile']).toEqual({ public: 'After' });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        locale: 'zh',
      })
    ).data['rows'],
  ).toEqual([{ id: firstRow['id'], public: '中文' }]);
  for (const data of [
    { profile: { secret: 'Hidden' } },
    { profile: null },
    { rows: [] },
    { blocks: [{ id: block['id'], blockType: 'public', public: 'Switched' }] },
  ])
    await expect(
      kit.content.api.updateDocument(kit.owner(), {
        collection: 'articles',
        id: first.id,
        revision: saved.revision,
        data,
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  showSecret = true;
  const visible = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
  });
  expect(visible.data['profile']).toEqual({ public: 'After', secret: 'Hidden' });
  expect(visible.data['rows']).toEqual([
    { id: firstRow['id'], public: 'English updated', secret: 'Row hidden' },
  ]);
});

it('checks locale-specific write policy on propagated shared fields', async () => {
  const collections = workflowCollections();
  contentField(contentCollection(collections, 'articles'), 'score').access = {
    write: {
      version: '1',
      run: (ctx) => ctx.operation === 'documents.create' || ctx.locale !== 'zh',
    },
  };
  const kit = await fixture(collections);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Shared', score: 1 },
  });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: first.revision,
      locale: 'en',
      data: { score: 2 },
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: first.id })).data[
      'score'
    ],
  ).toBe(1);
});

it.each(['constructor', 'toString'])(
  'treats locale %s as data rather than an inherited dictionary member',
  async (locale) => {
    const collections = workflowCollections();
    for (const collection of collections)
      collection.locales = { default: locale, supported: [locale], fallback: {} };
    const kit = await fixture(collections);
    const direct = await kit.content.api.createDocument(kit.owner(), {
      collection: 'pages',
      data: { title: 'Direct safe' },
    });
    expect(direct.data['title']).toBe('Direct safe');
    const draft = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Publish safe' },
    });
    expect(
      (
        await kit.content.api.publishDocument(kit.owner(), {
          collection: 'articles',
          id: draft.id,
          revision: draft.revision,
        })
      ).data['title'],
    ).toBe('Publish safe');
  },
);

it('restores exact nested snapshots while preserving stable IDs and checking changed protected descendants', async () => {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  let allowSecret = false;
  articles.history = { maxVersions: 10, retentionMs: 0 };
  articles.fields = [
    ...articles.fields,
    {
      id: 'details',
      name: 'details',
      type: 'group',
      fields: [
        { id: 'caption', name: 'caption', type: 'text' },
        { id: 'metadata', name: 'metadata', type: 'json' },
      ],
    },
    {
      id: 'items',
      name: 'items',
      type: 'array',
      fields: [
        { id: 'item_label', name: 'label', type: 'text' },
        {
          id: 'item_secret',
          name: 'secret',
          type: 'text',
          access: {
            write: {
              version: '1',
              run: ({ operation }) => operation === 'documents.create' || allowSecret,
            },
          },
        },
      ],
    },
    {
      id: 'sections',
      name: 'sections',
      type: 'blocks',
      blocks: [
        {
          id: 'text_block',
          key: 'text',
          label: 'Text',
          fields: [{ id: 'section_text', name: 'text', type: 'text' }],
        },
        {
          id: 'number_block',
          key: 'number',
          label: 'Number',
          fields: [{ id: 'section_number', name: 'number', type: 'number' }],
        },
      ],
    },
  ];
  const kit = await fixture(collections);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: {
      title: 'Nested',
      details: { caption: 'Before', metadata: [{ value: 'A', keep: true }, { value: 'B' }] },
      items: [{ label: 'First', secret: 'Preserved' }],
      sections: [{ blockType: 'text', text: 'Old section' }],
    },
  });
  const rows = first.data['items'];
  const { sections } = first.data;
  if (!Array.isArray(rows) || !Array.isArray(sections)) throw new Error('Container missing');
  const [row] = rows;
  const [section] = sections;
  if (
    !row ||
    typeof row !== 'object' ||
    Array.isArray(row) ||
    !section ||
    typeof section !== 'object' ||
    Array.isArray(section)
  )
    throw new Error('Row missing');
  const second = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: {
      details: { caption: 'After', metadata: [{ value: 'Changed' }] },
      items: [{ id: row['id'], label: 'Changed' }, { label: 'Added' }],
      sections: [{ id: section['id'], blockType: 'number', number: 2 }],
    },
  });
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: second.revision,
    versionId: first.versionId,
  });
  expect(restored.data).toEqual(first.data);
  allowSecret = true;
  const changed = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: restored.revision,
    data: { items: [{ id: row['id'], secret: 'Changed secret' }] },
  });
  allowSecret = false;
  await expect(
    kit.content.api.restoreVersion(kit.owner(), {
      collection: 'articles',
      id: first.id,
      revision: changed.revision,
      versionId: first.versionId,
    }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: first.id }))
      .revision,
  ).toBe(changed.revision);
});
