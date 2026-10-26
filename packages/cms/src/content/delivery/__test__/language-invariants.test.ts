import { afterEach, expect, it } from 'vitest';
import { createPublicFixture } from '../../../../../../test/support/public-runtime.ts';
const fixtures: Awaited<ReturnType<typeof createPublicFixture>>[] = [];
async function fixture() {
  const kit = await createPublicFixture();
  fixtures.push(kit);
  return kit;
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('rejects a second default language before it can invalidate every dynamic collection', async () => {
  const kit = await fixture();
  const languages = await kit.content.api.listDocuments(kit.owner(), { collection: 'languages' });
  const chinese = languages.rows.find(({ data }) => data['code'] === 'zh');
  if (!chinese) throw new Error('Missing Chinese locale');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'languages',
      id: chinese.id,
      revision: chinese.revision,
      data: { default: true },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect((await kit.delivery.getInterface({ locale: 'en' })).data.languages.defaultLocale).toBe(
    'en',
  );
});

it('rejects disabling or archiving the sole enabled default and leaves admin reads usable', async () => {
  const kit = await fixture();
  const languages = await kit.content.api.listDocuments(kit.owner(), { collection: 'languages' });
  const english = languages.rows.find(({ data }) => data['code'] === 'en');
  if (!english) throw new Error('Missing English locale');
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'languages',
      id: english.id,
      revision: english.revision,
      data: { enabled: false },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    kit.content.api.archiveDocument(kit.owner(), {
      collection: 'languages',
      id: english.id,
      revision: english.revision,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await kit.content.api.listDocuments(kit.owner(), { collection: 'languages' })).total,
  ).toBe(2);
});
