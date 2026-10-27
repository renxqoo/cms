import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';
import type { CollectionPolicy } from '../../definition.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});
const restricted: CollectionPolicy = {
  version: '1',
  run: ({ actor }) =>
    actor.role.isSuper ? true : { field: 'title', operator: 'ne', value: 'Hidden' },
};

it('regression: direct document get cannot disable configured fallback for its row policy', async () => {
  const collections = workflowCollections();
  const [article] = collections;
  if (!article) throw new Error('Missing articles');
  article.access = { 'documents.get': restricted };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const hidden = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Hidden' },
  });
  const actor = await contentActor(kit, ['articles:documents.get']);
  await expect(
    kit.content.api.getDocument(actor.ctx(), {
      collection: 'articles',
      id: hidden.id,
      locale: 'zh',
      fallback: [],
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
});

it.each([false, true])(
  'regression: client fallback cannot expose hidden documents through list, total, indexed filters or get (indexed=%s)',
  async (indexed) => {
    const collections = workflowCollections();
    const [article] = collections;
    if (!article) throw new Error('Missing articles');
    article.access = { 'documents.list': restricted, 'documents.get': restricted };
    if (indexed) article.indexes = [{ id: 'by_title', fields: ['title'] }];
    const kit = await createContentFixture({ collections });
    fixtures.push(kit);
    const hidden = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Hidden' },
    });
    const visible = await kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title: 'Visible' },
    });
    for (const document of [hidden, visible])
      await kit.content.api.publishDocument(kit.owner(), {
        collection: 'articles',
        id: document.id,
        revision: document.revision,
      });
    const actor = await contentActor(kit, ['articles:documents.list', 'articles:documents.get']);
    for (const mode of ['editing', 'published'] as const)
      for (const fallback of [undefined, [], ['en']]) {
        const input = {
          collection: 'articles',
          locale: 'zh',
          mode,
          ...(fallback ? { fallback } : {}),
        };
        const page = await kit.content.api.listDocuments(actor.ctx(), {
          ...input,
          where: { field: 'title', operator: 'ne', value: 'Hidden' },
        });
        expect(page.rows.map((row) => row.id)).toEqual([visible.id]);
        expect(page.total).toBe(1);
        await expect(
          kit.content.api.getDocument(actor.ctx(), { ...input, id: hidden.id }),
        ).rejects.toMatchObject({ code: 'not_found' });
        const current = await kit.content.api.getDocument(actor.ctx(), {
          ...input,
          id: visible.id,
        });
        expect(current.data['title']).toBe(fallback?.length === 0 ? undefined : 'Visible');
      }
  },
);

it('regression: nested relation row policies use configured fallback while client query and result data retain their selected fallback', async () => {
  const collections = workflowCollections();
  const [article, page] = collections;
  if (!article || !page) throw new Error('Missing collections');
  article.access = { 'documents.get': restricted };
  page.access = {
    'documents.list': {
      version: '1',
      run: ({ actor }) =>
        actor.role.isSuper
          ? true
          : { field: 'author.related.title', operator: 'ne', value: 'Hidden' },
    },
  };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const make = (title: string, related?: string) =>
    kit.content.api.createDocument(kit.owner(), {
      collection: 'articles',
      data: { title, ...(related ? { related: [{ collection: 'articles', id: related }] } : {}) },
    });
  const hidden = await make('Hidden');
  const visible = await make('Visible');
  const hiddenMiddle = await make('Hidden middle', hidden.id);
  const visibleMiddle = await make('Visible middle', visible.id);
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Hidden source', author: { collection: 'articles', id: hiddenMiddle.id } },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Visible source', author: { collection: 'articles', id: visibleMiddle.id } },
  });
  const actor = await contentActor(kit, ['pages:documents.list', 'articles:documents.get']);
  const result = await kit.content.api.listDocuments(actor.ctx(), {
    collection: 'pages',
    locale: 'zh',
    fallback: [],
    where: { field: 'author.title', operator: 'ne', value: 'Hidden' },
    depth: 2,
  });
  expect(result.rows.map((row) => row.id)).toEqual([source.id]);
  expect(result.total).toBe(1);
  const author = result.rows[0]?.data['author'];
  expect(author).toHaveProperty('id', visibleMiddle.id);
  expect(author).not.toHaveProperty('data.title');
});
