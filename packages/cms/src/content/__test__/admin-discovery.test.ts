import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import { createRegistry } from '../generate.ts';
import { contentLimits } from '../../../../../test/support/content.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('hides admin routes without revoking document APIs and immediately reflects a changed hidden predicate', async () => {
  const collections = workflowCollections();
  let hidden = true;
  contentCollection(collections, 'articles').admin = {
    group: { en: 'Editorial', zh: '编辑内容' },
    hidden: {
      version: 'visibility',
      run: (context) =>
        Promise.resolve(
          hidden && context.actor.role.isSuper && context.signal instanceof AbortSignal,
        ),
    },
    pagination: { defaultLimit: 7, limits: [7, 21] },
  };
  contentCollection(collections, 'pages').admin = { group: false };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'API remains available' },
  });
  const list = await kit.content.api.listCollections(kit.owner(), {});
  expect(list.rows.find((collection) => collection.key === 'articles')?.admin).toMatchObject({
    hidden: true,
    group: 'Editorial',
    pagination: { defaultLimit: 7, limits: [7, 21] },
  });
  await expect(
    kit.content.api.getCollection(kit.owner(), { collection: 'articles' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.getEditor(kit.owner(), { collection: 'articles', intent: 'create' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  expect(
    await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }),
  ).toMatchObject({ id: document.id, data: { title: 'API remains available' } });
  expect(await kit.content.api.getCollection(kit.owner(), { collection: 'pages' })).toMatchObject({
    admin: { group: false },
  });
  hidden = false;
  expect(
    await kit.content.api.getCollection(kit.owner(), { collection: 'articles' }),
  ).toMatchObject({ admin: { hidden: false } });
  expect(
    await kit.content.api.getEditor(kit.owner(), { collection: 'articles', intent: 'create' }),
  ).toMatchObject({ intent: 'create' });
});

it('rejects invalid pagination limits and thumbnail paths before activating a collection', () => {
  for (const admin of [
    { pagination: { defaultLimit: 101 } },
    { pagination: { limits: [7, 7] } },
    { pagination: { limits: [101] } },
    { useAsThumbnail: 'title' },
    { useAsThumbnail: 'missing' },
  ]) {
    const collections = workflowCollections();
    contentCollection(collections, 'articles').admin = admin;
    expect(() => createRegistry({ collections, limits: contentLimits() })).toThrow('invalid input');
  }
});
