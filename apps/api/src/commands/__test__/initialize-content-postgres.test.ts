import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { createContentFixture } from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';
import { oneasterCollections } from '../../config/collections/oneaster.ts';
import { initializeInterfaceContent } from '../interface-initialization.ts';
import { interfaceMessageSeeds } from '../../config/message-contract.ts';

let fixture: ContentFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('concurrent missing-only initialization uses real unique constraints and preserves existing translations', async () => {
  fixture = await createContentFixture({
    collections: oneasterCollections
      .filter((collection) => ['languages', 'message-bundles'].includes(collection.key))
      .map((collection) => ({ ...collection, id: `test_${collection.id}` })),
  });
  const messages = structuredClone(interfaceMessageSeeds['zh']?.['site']);
  if (messages === null || typeof messages !== 'object' || Array.isArray(messages))
    throw new Error('Missing site messages');
  messages['brandLine'] = 'Existing editorial text';
  const existing = await fixture.content.api.createDocument(fixture.owner(), {
    collection: 'message-bundles',
    data: {
      contractVersion: 'oneaster-ui.v5',
      locale: 'zh',
      namespace: 'site',
      messages,
    },
  });
  const results = await Promise.all([
    initializeInterfaceContent(fixture.content.api, fixture.owner()),
    initializeInterfaceContent(fixture.content.api, fixture.owner()),
  ]);
  expect(results.reduce((total, value) => total + value.createdLanguages, 0)).toBe(2);
  expect(results.reduce((total, value) => total + value.createdBundles, 0)).toBe(25);
  const languages = await fixture.content.api.listDocuments(fixture.owner(), {
    collection: 'languages',
  });
  expect(
    languages.rows
      .map((row) => z.string().parse(row.data['code']))
      .toSorted((left, right) => left.localeCompare(right)),
  ).toEqual(['en', 'zh']);
  const preserved = await fixture.content.api.getDocument(fixture.owner(), {
    collection: 'message-bundles',
    id: existing.id,
  });
  expect(preserved.versionId).toBe(existing.versionId);
  expect(preserved.data['messages']).toEqual(messages);
  expect(await initializeInterfaceContent(fixture.content.api, fixture.owner())).toEqual({
    createdLanguages: 0,
    createdBundles: 0,
  });
});
