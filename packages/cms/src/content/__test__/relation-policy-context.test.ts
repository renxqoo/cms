import { afterEach, expect, it } from 'vitest';
import {
  createContentFixture,
  workflowCollections,
  contentCollection,
} from '../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../test/support/content-actor.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

let fixture: ContentFixture | undefined;
afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

it('reads and saves documents under a relation policy with the same target permissions as their editor metadata', async () => {
  const collections = workflowCollections();
  const article = contentCollection(collections, 'articles');
  const related = article.fields.find((field) => field.name === 'related');
  if (!related) throw new Error('Missing relationship fixture');
  related.relationTo = ['pages'];
  const relationPolicy = {
    version: 'linked-page-title-v1',
    run: () => ({
      field: 'related.title',
      operator: 'eq' as const,
      value: 'Eligible landing page',
    }),
  };
  article.access = { 'documents.get': relationPolicy, 'documents.update': relationPolicy };
  const kit = await createContentFixture({ collections });
  fixture = kit;
  const page = await kit.content.api.createDocument(kit.owner(), {
    collection: 'pages',
    data: { title: 'Eligible landing page' },
  });
  const document = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Related policy article', related: [{ collection: 'pages', id: page.id }] },
  });
  await expect(
    kit.content.api.getEditor(kit.owner(), { collection: 'articles', id: document.id }),
  ).resolves.toMatchObject({ document: { id: document.id } });
  await expect(
    kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: document.id }),
  ).resolves.toMatchObject({ id: document.id });
  await expect(
    kit.content.api.updateDocument(kit.owner(), {
      collection: 'articles',
      id: document.id,
      revision: document.revision,
      data: { title: 'Still visible after save' },
    }),
  ).resolves.toMatchObject({ revision: document.revision + 1 });
  const restricted = await contentActor(kit, [
    'articles:collections.editor',
    'articles:documents.get',
  ]);
  await expect(
    kit.content.api.getEditor(restricted.ctx(), { collection: 'articles', id: document.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    kit.content.api.getDocument(restricted.ctx(), { collection: 'articles', id: document.id }),
  ).rejects.toMatchObject({ code: 'not_found' });
});
