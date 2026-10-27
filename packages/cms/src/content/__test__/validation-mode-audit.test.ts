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
async function fixture(
  validate: NonNullable<
    ReturnType<typeof workflowCollections>[number]['fields'][number]['validate']
  >,
) {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  article.mode = 'direct';
  delete article.drafts;
  contentField(article, 'score').localized = true;
  contentField(article, 'score').validate = validate;
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  return kit;
}
it('regression: an independent publication validation of a direct collection does not first validate its candidate as a draft', async () => {
  const kit = await fixture({
    version: 'publication-mode',
    run: (_value, context) => context.mode === 'publish',
  });
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      mode: 'publish',
      data: { title: 'Complete', score: 1 },
    }),
  ).toEqual({ valid: true, errors: [] });
});
it('regression: an invalid translated direct-collection candidate retains its language in validation errors', async () => {
  const kit = await fixture({
    version: 'positive',
    run: (value) => typeof value === 'number' && value > 0,
  });
  expect(
    await kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      mode: 'publish',
      dataByLocale: { en: { title: 'English', score: 1 }, zh: { title: '中文', score: -1 } },
    }),
  ).toMatchObject({ valid: false, errors: [{ field: 'score', locale: 'zh' }] });
  await expect(
    kit.content.api.validateDocument(kit.owner(), {
      collection: 'articles',
      mode: 'publish',
      dataByLocale: {
        en: { title: 'English', slug: 'first', score: 1 },
        zh: { title: '中文', slug: 'second', score: 1 },
      },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});
