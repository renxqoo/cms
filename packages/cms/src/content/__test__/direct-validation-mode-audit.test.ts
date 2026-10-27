import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
  contentField,
} from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
let fixture: ContentFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});
it('regression: direct saves accept validators requiring publication mode on both create and update', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.mode = 'direct';
  delete article.drafts;
  contentField(article, 'score').validate = {
    version: 'publication-mode',
    run: (_value, context) => context.mode === 'publish',
  };
  const kit = await createContentFixture({ collections });
  fixture = kit;
  const created = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Complete', score: 1 },
  });
  expect(created.data['score']).toBe(1);
  const updated = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: created.id,
    revision: created.revision,
    data: { score: 2 },
  });
  expect(updated.data['score']).toBe(2);
});
