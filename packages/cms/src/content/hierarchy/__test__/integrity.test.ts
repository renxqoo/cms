import { afterEach, expect, it } from 'vitest';
import { createContent, createHierarchyIntegrityValidator } from '../../composition.ts';
import { createRegistry, compileContent } from '../../generate.ts';
import { contentOperations } from '../../operations.ts';
import {
  createContentFixture,
  contentCollection,
  workflowCollections,
} from '../../../../../../test/support/content-runtime.ts';
import type { ContentFixture } from '../../../../../../test/support/content-runtime.ts';

const fixtures: ContentFixture[] = [];
afterEach(async () => {
  for (const kit of fixtures.splice(0)) await kit.close();
});

async function fixture() {
  const collections = workflowCollections();
  const definition = contentCollection(collections, 'articles');
  definition.fields = [
    ...definition.fields,
    { id: 'parent', name: 'parent', type: 'relationship', relationTo: ['articles'] },
  ];
  const kit = await createContentFixture({ collections });
  fixtures.push(kit);
  const first = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'First' },
  });
  const second = await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Second', parent: { collection: 'articles', id: first.id } },
  });
  definition.hierarchy = true;
  definition.admin = { useAsTitle: 'title' };
  const registry = createRegistry({
    collections,
    limits: kit.limits,
    operations: contentOperations,
  });
  const mapping = compileContent(registry);
  const content = createContent({ ...kit.contentOptions, registry, mapping });
  const options = {
    database: kit.database,
    registry,
    mapping,
    limits: kit.limits,
    policy: kit.policy,
    resourceLockKey: kit.contentOptions.workPolicy.resourceLockKey,
    maxDepth: kit.contentOptions.workPolicy.maxFolderDepth,
  };
  return { kit, first, second, content, options };
}

it('regression: readiness rejects a pre-existing cycle even after the schema manifest is ready and validates again after repair', async () => {
  const { kit, first, second, content, options } = await fixture();
  const broken = await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: first.revision,
    data: { parent: { collection: 'articles', id: second.id } },
  });
  await expect(content.verifyReady()).rejects.toMatchObject({ code: 'invalid_input' });
  const before = await kit.database.query<{ validated_epoch: string | null }>(
    'SELECT validated_epoch::text FROM content_hierarchy_validation WHERE collection_id=$1',
    [options.registry.get('articles').id],
  );
  expect(before.rows).toEqual([{ validated_epoch: null }]);
  await kit.content.api.updateDocument(kit.owner(), {
    collection: 'articles',
    id: first.id,
    revision: broken.revision,
    data: { parent: null },
  });
  await content.verifyReady();
  await expect(createHierarchyIntegrityValidator(options).validateAll()).resolves.toEqual([
    { collection: 'articles', processed: 0, cached: true },
  ]);
});

it('invalidates only registered graph epochs and refuses to reuse a stamp after depth configuration changes', async () => {
  const { kit, second, content, options } = await fixture();
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Third', parent: { collection: 'articles', id: second.id } },
  });
  await content.verifyReady();
  const previous = await kit.database.query<{ epoch: string; validated_epoch: string }>(
    'SELECT epoch::text,validated_epoch::text FROM content_hierarchy_validation WHERE collection_id=$1',
    [options.registry.get('articles').id],
  );
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'settings',
    data: { title: 'Unrelated settings' },
  });
  const unchanged = await kit.database.query(
    'SELECT epoch::text,validated_epoch::text FROM content_hierarchy_validation WHERE collection_id=$1',
    [options.registry.get('articles').id],
  );
  expect(unchanged.rows).toEqual(previous.rows);
  await expect(
    createHierarchyIntegrityValidator({ ...options, maxDepth: 2 }).validateAll(),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  await expect(
    createHierarchyIntegrityValidator({
      ...options,
      limits: { ...options.limits, maxSqlQueries: 1 },
    }).validateAll(),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  const abort = new AbortController();
  abort.abort();
  await expect(content.verifyReady(abort.signal)).rejects.toThrow(/abort|cancel|terminated/i);
});

it('regression: a concurrent readiness check cannot steal an active graph validation and expired claims can recover', async () => {
  const { kit, content, options } = await fixture();
  await content.verifyReady();
  await kit.database.query(
    "UPDATE content_hierarchy_validation SET epoch=epoch+1,validation_token=gen_random_uuid(),validating_configuration=configuration,validation_expires_at=clock_timestamp()+interval '1 minute' WHERE collection_id=$1",
    [options.registry.get('articles').id],
  );
  await expect(content.verifyReady()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await kit.database.query(
    "UPDATE content_hierarchy_validation SET validation_expires_at=clock_timestamp()-interval '1 millisecond' WHERE collection_id=$1",
    [options.registry.get('articles').id],
  );
  await expect(createHierarchyIntegrityValidator(options).validateAll()).resolves.toEqual([
    { collection: 'articles', processed: 2, cached: false },
  ]);
  await expect(content.verifyReady()).resolves.toBeUndefined();
});

it('regression: changing the dynamic language source invalidates the graph readiness stamp without changing content', async () => {
  const collections = workflowCollections();
  const definition = contentCollection(collections, 'articles');
  definition.hierarchy = true;
  definition.localeSource = 'currentLanguages';
  let languages = {
    default: 'en',
    supported: ['en', 'zh'],
    fallback: { zh: ['en'] },
    enabled: ['en', 'zh'],
  };
  const kit = await createContentFixture({
    collections,
    compose(options) {
      const configured = {
        ...options,
        resolveLocaleSource() {
          return Promise.resolve(structuredClone(languages));
        },
      };
      return {
        content: createContent(configured),
        options: configured,
        close: () => Promise.resolve(),
      };
    },
  });
  fixtures.push(kit);
  await kit.content.api.createDocument(kit.owner(), {
    collection: 'articles',
    data: { title: 'Dynamic language root' },
  });
  const validator = createHierarchyIntegrityValidator({
    ...kit.contentOptions,
    resourceLockKey: kit.contentOptions.workPolicy.resourceLockKey,
    maxDepth: kit.contentOptions.workPolicy.maxFolderDepth,
  });
  await kit.content.verifyReady();
  await expect(validator.validateAll()).resolves.toEqual([
    { collection: 'articles', processed: 0, cached: true },
  ]);
  languages = {
    ...languages,
    default: 'zh',
    supported: ['en', 'zh', 'fr'],
    enabled: ['en', 'zh', 'fr'],
  };
  await expect(validator.validateAll()).resolves.toEqual([
    { collection: 'articles', processed: 1, cached: false },
  ]);
  await expect(validator.validateAll()).resolves.toEqual([
    { collection: 'articles', processed: 0, cached: true },
  ]);
});
