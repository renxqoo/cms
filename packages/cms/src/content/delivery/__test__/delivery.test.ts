import { afterEach, expect, it } from 'vitest';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import {
  createPublicFixture,
  createPublicModel as model,
} from '../../../../../../test/support/public-runtime.ts';
const fixtures: ContentFixture[] = [];
async function fixture() {
  const kit = await createPublicFixture();
  fixtures.push(kit);
  return kit;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('publishes display-only models without a binding and never exposes draft-only or unselected language content', async () => {
  const kit = await fixture();
  const published = await model(kit);
  await model(kit, { modelId: 'private-key', slug: 'private-model' }, false);
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'models',
    id: published.id,
    revision: published.revision,
    data: { title: 'Private new title', modelId: 'private-new-key' },
  });
  const catalog = await kit.delivery.listModels({ locale: 'en' });
  expect(catalog.data.models.map((row) => [row.title, row.modelId, row.platformAccess])).toEqual([
    ['Published Alpha', 'business-exact-key', 'unsupported'],
  ]);
  expect(catalog.data.facets.categories).toEqual([{ value: 'text', label: 'text', count: 1 }]);
  expect((await kit.delivery.getModel({ locale: 'en', slug: 'alpha' })).data.model.content).toEqual(
    { overview: 'Public content' },
  );
  expect((await kit.delivery.listModels({ locale: 'zh' })).data.models).toEqual([]);
  await expect(
    kit.delivery.getModel({ locale: 'en', slug: 'private-model' }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(kit.delivery.getModel({ locale: 'fr', slug: 'alpha' })).rejects.toMatchObject({
    code: 'not_found',
  });
});

it('keeps facet totals and ordering consistent with the same filtered published snapshot', async () => {
  const kit = await fixture();
  const alpha = await model(kit);
  await model(kit, {
    modelId: 'image-key',
    slug: 'beta',
    title: 'Beta',
    primaryCategory: 'image',
    technicalCapabilities: {
      inputs: ['text'],
      outputs: ['image'],
      tasks: ['vision'],
      features: [],
    },
    presentation: { sortOrder: 1 },
  });
  const all = await kit.delivery.listModels({ locale: 'en', pageSize: '1' });
  expect(all.data.pagination).toEqual({ page: 1, pageSize: 1, total: 2, totalPages: 2 });
  expect(all.data.facets.categories.map((facet) => [facet.value, facet.count])).toEqual([
    ['image', 1],
    ['text', 1],
  ]);
  expect(
    (await kit.delivery.listModels({ locale: 'en', output: 'image' })).data.models.map(
      (row) => row.slug,
    ),
  ).toEqual(['beta']);
  expect(
    (await kit.delivery.listModels({ locale: 'en', sort: 'updated' })).data.models.map(
      (row) => row.slug,
    ),
  ).toEqual(['beta', 'alpha']);
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'models',
    id: alpha.id,
    revision: alpha.revision,
    data: { title: 'Draft becomes newer' },
  });
  expect(
    (await kit.delivery.listModels({ locale: 'en', sort: 'updated' })).data.models.map(
      (row) => row.slug,
    ),
  ).toEqual(['beta', 'alpha']);
  expect(
    (await kit.delivery.listModels({ locale: 'en', q: 'Published Alpha', callable: 'false' })).data
      .pagination.total,
  ).toBe(1);
});

it('serves exact software message contracts and changes revisions only when the returned representation changes', async () => {
  const kit = await fixture();
  await model(kit);
  const first = await kit.delivery.getInterface({
    locale: 'en',
    messageContractVersion: 'oneaster-ui.test',
  });
  expect(first.data.messages).toEqual({ site: { hello: 'Hello' } });
  expect(first.data.languages.defaultLocale).toBe('en');
  expect(first.data.initialized).toBe(true);
  expect((await kit.delivery.getInterface({ locale: 'en' })).revision).toBe(first.revision);
  expect((await kit.delivery.getInterface({ locale: 'zh' })).data.messages).toEqual({
    site: { hello: '你好' },
  });
  await expect(
    kit.delivery.getInterface({ locale: 'en', messageContractVersion: 'old' }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});

it('withdraws public entries immediately on unpublish and rejects unknown filters', async () => {
  const kit = await fixture();
  const published = await model(kit);
  await kit.content.api.unpublishDocument(kit.owner(), {
    collection: 'models',
    id: published.id,
    revision: published.revision,
  });
  expect((await kit.delivery.listModels({ locale: 'en' })).data.pagination.total).toBe(0);
  await expect(kit.delivery.getModel({ locale: 'en', slug: 'alpha' })).rejects.toMatchObject({
    code: 'not_found',
  });
  await expect(kit.delivery.listModels({ locale: 'en', oldLimit: '50' })).rejects.toMatchObject({
    code: 'invalid_input',
  });
});
