import { expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

it('regression: metadata and implicit sorting follow the requested content language while mixed catalogs fall back per collection', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  const title = article.fields.find((field) => field.name === 'title');
  if (!title) throw new Error('Missing title');
  title.access = {
    read: { version: '1', run: ({ actor, locale }) => actor.role.isSuper || locale === 'zh' },
    query: { version: '1', run: ({ actor, locale }) => actor.role.isSuper || locale === 'zh' },
  };
  contentCollection(collections, 'pages').locales = {
    default: 'en',
    supported: ['en'],
    fallback: {},
  };
  const kit = await createContentFixture({ collections });
  try {
    const alpha = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Alpha' },
    });
    const zulu = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Zulu' },
    });
    const editor = await contentActor(kit, [
      'articles:documents.list',
      'articles:collections.get',
      'pages:collections.get',
    ]);
    const english = await kit.content.api.getCollection(editor.ctx(), {
      collection: 'articles',
      locale: 'en',
    });
    expect(english.fields.some((field) => field.path === 'title')).toBe(false);
    expect(english.defaultSort).toEqual([{ field: 'updatedAt', order: 'desc' }]);
    const chinese = await kit.content.api.getCollection(editor.ctx(), {
      collection: 'articles',
      locale: 'zh',
    });
    expect(chinese.fields.find((field) => field.path === 'title')?.queryable).toBe(true);
    expect(chinese.defaultSort).toEqual([{ field: 'title', order: 'asc' }]);
    const catalog = await kit.content.api.listCollections(editor.ctx(), { locale: 'zh' });
    expect(
      catalog.rows
        .find((collection) => collection.key === 'pages')
        ?.fields.some((field) => field.path === 'title'),
    ).toBe(true);
    expect(
      (
        await kit.content.api.listDocuments(editor.ctx(), { collection: 'articles', locale: 'zh' })
      ).rows.map((row) => row.id),
    ).toEqual([alpha.id, zulu.id]);
    expect(
      (
        await kit.content.api.listDocuments(editor.ctx(), { collection: 'articles', locale: 'en' })
      ).rows.map((row) => row.id),
    ).toEqual([zulu.id, alpha.id]);
    await expect(
      kit.content.api.listDocuments(editor.ctx(), {
        collection: 'articles',
        locale: 'en',
        sort: [{ field: 'title', order: 'asc' }],
      }),
    ).rejects.toMatchObject({ code: 'forbidden' });
  } finally {
    await kit.close();
  }
});

it('applies Admin base filters and additional searchable fields only to Admin lists, distinct and groups after authorization', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  let calls = 0;
  article.fields = [
    ...article.fields,
    { id: 'summary', name: 'summary', type: 'text' },
    {
      id: 'secret',
      name: 'secret',
      type: 'text',
      access: {
        read: { version: '1', run: () => false },
        query: { version: '1', run: () => false },
      },
    },
    {
      id: 'categories',
      name: 'categories',
      type: 'select',
      hasMany: true,
      options: ['red', 'blue'],
    },
  ];
  article.admin = {
    baseFilter: { version: '1', run: () => ({ field: 'title', operator: 'ne', value: 'Hidden' }) },
    listSearchableFields: ['summary', 'secret'],
    formatDocURL: {
      version: '1',
      run: ({ documentId }) => {
        calls += 1;
        return `/records/${documentId}`;
      },
    },
  };
  const kit = await createContentFixture({ collections });
  try {
    const visible = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: {
        title: 'Alpha',
        summary: 'shorthand',
        score: 1,
        secret: 'Private',
        categories: ['red', 'blue'],
      },
    });
    const hidden = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Hidden', summary: 'shorthand', score: 99, categories: ['red'] },
    });
    expect(
      (await kit.content.api.listDocuments(kit.owner(), { collection: 'articles' })).total,
    ).toBe(2);
    expect(calls).toBe(0);
    expect(
      (await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: hidden.id }))
        .id,
    ).toBe(hidden.id);
    expect(
      (await kit.content.api.listDocuments(kit.owner(), { collection: 'articles', q: 'hand' }))
        .rows,
    ).toEqual([]);
    const listed = await kit.content.api.listDocuments(kit.owner(), {
      collection: 'articles',
      context: 'admin',
      q: 'hand',
    });
    expect(listed.rows.map((row) => row.id)).toEqual([visible.id]);
    expect(listed.rows[0]?.adminURL).toBe(`/records/${visible.id}`);
    expect(
      (
        await kit.content.api.listDocuments(kit.owner(), {
          collection: 'articles',
          context: 'admin',
          q: 'pha',
        })
      ).total,
    ).toBe(1);
    expect(
      (
        await kit.content.api.listDocuments(kit.owner(), {
          collection: 'articles',
          context: 'admin',
          q: 'Private',
        })
      ).total,
    ).toBe(0);
    expect(
      await kit.content.api.distinctDocuments(kit.owner(), {
        collection: 'articles',
        context: 'admin',
        field: 'score',
        order: 'asc',
      }),
    ).toMatchObject({ rows: [1], total: 1 });
    calls = 0;
    const groups = await kit.content.api.groupDocuments(kit.owner(), {
      collection: 'articles',
      context: 'admin',
      groupBy: { field: 'categories', order: 'asc' },
    });
    expect(groups.rows.map((group) => group.documents.rows.map((row) => row.id))).toEqual([
      [visible.id],
      [visible.id],
    ]);
    expect(calls).toBe(1);
    expect(
      groups.rows.every((group) => group.documents.rows[0]?.adminURL === `/records/${visible.id}`),
    ).toBe(true);
  } finally {
    await kit.close();
  }
});
