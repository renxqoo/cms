import { afterEach, expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

it('shows authorized target authors when relation expansion starts in a collection with authorship disabled', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'pages').authorship = false;
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const owner = await kit.access.api.me(kit.owner(), {});
  const target = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Authored target' },
  });
  const source = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Untracked source', author: { collection: 'articles', id: target.id } },
  });
  const view = await kit.content.api.getDocument(kit.owner(), {
    collection: 'pages',
    id: source.id,
    depth: 1,
  });
  expect(view).not.toHaveProperty('createdBy');
  expect(view).not.toHaveProperty('updatedBy');
  expect(view.data['author']).toMatchObject({
    id: target.id,
    createdBy: { id: owner.id },
    updatedBy: { id: owner.id },
  });
});
