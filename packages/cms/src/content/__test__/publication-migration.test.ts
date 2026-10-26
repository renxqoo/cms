import { afterEach, expect, it } from 'vitest';
import { createContent, createPublicationMigrator } from '../composition.ts';
import { createRegistry, compileContent } from '../generate.ts';
import { contentOperations } from '../operations.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import { createContentFixture, workflowCollections } from '../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const fixture of fixtures.splice(0)) await fixture.close();
});

it('blocks readiness until existing global publications are expanded and preserves every published language', async () => {
  const kit = await createContentFixture();
  fixtures.push(kit);
  const draft = await kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title: 'Before switching' } });
  await kit.content.api.publishDocument(kit.owner(), { collection: 'articles', id: draft.id, revision: draft.revision });
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  const registry = createRegistry({ collections, limits: kit.limits, operations: [...contentOperations, ...assetsOperations] });
  const content = createContent({ ...kit.contentOptions, registry, mapping: compileContent(registry) });
  try {
    await expect(content.verifyReady()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
    const migration = createPublicationMigrator({
      database: kit.database, registry, policy: kit.policy,
      resourceLockKey: kit.contentOptions.workPolicy.resourceLockKey,
      maxPageSize: kit.limits.maxPageSize,
    });
    expect(await migration.migratePage({ collection: 'articles', pageSize: 1 })).toEqual({ processed: 1, complete: false });
    expect(await migration.migratePage({ collection: 'articles', pageSize: 1 })).toEqual({ processed: 0, complete: true });
    await expect(content.verifyReady()).resolves.toBeUndefined();
    for (const locale of ['en', 'zh'])
      expect(await content.api.getDocument(kit.owner(), { collection: 'articles', id: draft.id, locale, mode: 'published' }))
        .toMatchObject({ versionId: draft.versionId, data: { title: 'Before switching' } });
    const global = await kit.database.query("SELECT 1 FROM content_publications WHERE document_id=$1 AND locale='*'", [draft.id]);
    expect(global.rowCount).toBe(0);
    await expect(kit.content.verifyReady()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  } finally {
    await content.close();
  }
});

it('does not silently collapse independently published languages when the configuration is reversed', async () => {
  const collections = workflowCollections();
  const articles = collections.find((collection) => collection.key === 'articles');
  if (!articles) throw new Error('Missing articles fixture');
  articles.localizeStatus = true;
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const draft = await kit.content.api.createDocument(kit.owner(), { collection: 'articles', data: { title: 'English only' } });
  await kit.content.api.publishDocument(kit.owner(), { collection: 'articles', id: draft.id, revision: draft.revision, locale: 'en' });
  const registry = createRegistry({ collections: workflowCollections(), limits: kit.limits, operations: [...contentOperations, ...assetsOperations] });
  const migration = createPublicationMigrator({
    database: kit.database, registry, policy: kit.policy,
    resourceLockKey: kit.contentOptions.workPolicy.resourceLockKey,
    maxPageSize: kit.limits.maxPageSize,
  });
  await expect(migration.migratePage({ collection: 'articles', pageSize: 10 })).rejects.toMatchObject({ code: 'invalid_input' });
  expect(await kit.content.api.getDocument(kit.owner(), { collection: 'articles', id: draft.id, locale: 'en', mode: 'published' }))
    .toMatchObject({ versionId: draft.versionId });
});
