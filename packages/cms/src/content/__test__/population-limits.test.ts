import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture() {
  const collections = workflowCollections();
  const articles = contentCollection(collections, 'articles');
  articles.fields = [
    ...articles.fields,
    { id: 'shallow', name: 'shallow', type: 'relationship', relationTo: ['pages'], maxDepth: 1 },
    { id: 'deep', name: 'deep', type: 'relationship', relationTo: ['pages'], maxDepth: 3 },
    { id: 'identity', name: 'identity', type: 'relationship', relationTo: ['pages'], maxDepth: 0 },
  ];
  const pages = contentCollection(collections, 'pages');
  pages.defaultPopulate = ['title', 'parent'];
  pages.fields = [
    ...pages.fields,
    { id: 'secret', name: 'secret', type: 'text' },
    { id: 'parent', name: 'parent', type: 'relationship', relationTo: ['pages'], maxDepth: 2 },
    {
      id: 'inverse',
      name: 'inverse',
      type: 'join',
      join: { collection: 'articles', field: 'deep' },
      maxDepth: 0,
    },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const leaf = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Leaf', secret: 'leaf secret' },
  });
  const middle = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: {
      title: 'Middle',
      secret: 'middle secret',
      parent: { collection: 'pages', id: leaf.id },
    },
  });
  const top = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Top', parent: { collection: 'pages', id: middle.id } },
  });
  const reference = { collection: 'pages', id: top.id };
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Source', shallow: reference, deep: reference, identity: reference },
  });
  return { kit, leaf, middle, top, source, reference };
}

it('keeps the same target separate when fields impose different population depths', async () => {
  const { kit, source, reference, middle, leaf } = await fixture();
  const view = await kit.content.api.getDocument(kit.owner(), {
    collection: 'articles',
    id: source.id,
    depth: 3,
  });
  expect(view.data['identity']).toEqual(reference);
  expect(view.data['shallow']).toMatchObject({
    data: { title: 'Top', parent: { collection: 'pages', id: middle.id } },
  });
  expect(view.data['deep']).toMatchObject({
    data: {
      title: 'Top',
      parent: {
        id: middle.id,
        data: { title: 'Middle', parent: { collection: 'pages', id: leaf.id } },
      },
    },
  });
  expect(JSON.stringify(view.data)).not.toContain('secret');
  expect(JSON.stringify(view.data)).not.toContain('inverse');
});

it('applies defaultPopulate only to expanded targets and keeps depth zero references unchanged', async () => {
  const { kit, source, top, reference } = await fixture();
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'articles',
      id: source.id,
      depth: 0,
    }),
  ).toMatchObject({ data: { shallow: reference, deep: reference, identity: reference } });
  const direct = await kit.content.api.getDocument(kit.owner(), {
    collection: 'pages',
    id: top.id,
    depth: 3,
  });
  expect(direct.data['inverse']).toMatchObject({
    rows: [{ collection: 'articles', id: source.id }],
    page: 1,
    hasNextPage: false,
  });
  expect(
    await kit.content.api.getDocument(kit.owner(), {
      collection: 'pages',
      id: top.id,
      select: ['title'],
    }),
  ).toMatchObject({ data: { title: 'Top' } });
});
