import { afterEach, expect, it } from 'vitest';
import {
  contentCollection,
  createContentFixture,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';
import { contentActor } from '../../../../../../test/support/content-actor.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});
it('reads the selected version writer instead of the current writer and safely attributes restoration to its executor', async () => {
  const collections = workflowCollections();
  contentCollection(collections, 'articles').history = { maxVersions: 100, retentionMs: 604800000 };
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const owner = await kit.access.api.me(kit.owner(), {});
  const editor = await contentActor(kit, [
    'articles:documents.get',
    'articles:documents.update',
    'articles:versions.get',
  ]);
  const editorIdentity = await kit.access.api.me(editor.ctx(), {});
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Owner created' },
  });
  const edited = await kit.content.api.updateDocument(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { title: 'Editor wrote' },
  });
  const current = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: edited.revision,
    data: { title: 'Owner latest' },
  });
  const previous = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    versionId: edited.versionId,
  });
  expect(previous.updatedBy?.id).toBe(editorIdentity.id);
  expect(previous.createdBy?.id).toBe(owner.id);
  expect(previous.data['title']).toBe('Editor wrote');
  const unprivileged = await kit.content.api.getVersion(editor.ctx(), {
    collection: 'articles',
    id: first.id,
    versionId: edited.versionId,
  });
  expect(unprivileged.updatedBy).toBeNull();
  expect(unprivileged.createdBy).toBeNull();
  const original = await kit.content.api.getVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    versionId: first.versionId,
  });
  expect(original.updatedBy?.id).toBe(owner.id);
  const restored = await kit.content.api.restoreVersion(kit.owner(), {
    collection: 'articles',
    id: first.id,
    versionId: edited.versionId,
    revision: current.revision,
  });
  expect(restored.updatedBy?.id).toBe(owner.id);
  expect(restored.createdBy?.id).toBe(owner.id);
  expect(restored.data['title']).toBe('Editor wrote');
});
