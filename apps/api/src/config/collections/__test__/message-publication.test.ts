import { afterEach, expect, it } from 'vitest';
import { createContentFixture } from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { oneasterCollections } from '../oneaster.ts';
import { interfaceMessageContract, interfaceMessageSeeds } from '../../message-contract.ts';
const fixtures: ContentFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((kit) => kit.close()));
});

it('rejects invalid software translations before a direct write can break the public interface', async () => {
  const collection = oneasterCollections.find(({ key }) => key === 'message-bundles');
  const messages = interfaceMessageSeeds['en']?.['site'];
  if (!collection || !messages) throw new Error('Missing software message contract');
  const kit = await createContentFixture({
    collections: [{ ...collection, id: 'test_message_bundles' }],
  });
  fixtures.push(kit);
  const original = await kit.content.api.createDocument(kit.owner(), {
    collection: collection.key,
    data: {
      contractVersion: interfaceMessageContract.version,
      locale: 'en',
      namespace: 'site',
      messages,
    },
  });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: collection.key,
      id: original.id,
      revision: original.revision,
      data: { messages: { siteHeader: { console: '{unexpected}' } } },
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (
      await kit.content.api.getDocument(kit.owner(), {
        collection: collection.key,
        id: original.id,
      })
    ).data['messages'],
  ).toEqual(messages);
});
