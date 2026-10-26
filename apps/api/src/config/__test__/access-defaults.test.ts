import { afterEach, expect, it } from 'vitest';
import { createAccessCatalog } from '@new-cms/cms/access/composition';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { initialCollectionPermissions } from '../access-defaults.ts';
import { applicationOperations } from '../operations.ts';
import { collections } from '../collections/index.ts';

const stores: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

it('regression: initial article and page permissions can download referenced media without allowing uploads', async () => {
  const store = await createTestDatabase();
  stores.push(store);
  const catalog = createAccessCatalog({
    database: store.database,
    policy: createTestPolicy(),
    operations: applicationOperations,
    collectionKeys: collections.map((collection) => collection.key),
    initialCollectionPermissions: initialCollectionPermissions(),
  });
  await catalog.reconcile();
  const bindings = await store.database.query(
    `SELECT b.collection_key,b.operation_id,p.code
     FROM endpoint_bindings b JOIN permissions p ON p.id=b.permission_id
     WHERE b.operation_id LIKE 'assets.%' ORDER BY b.collection_key,b.operation_id`,
  );
  expect(bindings.rows).toContainEqual({
    collection_key: 'articles',
    operation_id: 'assets.downloadBinding',
    code: 'content:articles:manage',
  });
  expect(bindings.rows).toContainEqual({
    collection_key: 'pages',
    operation_id: 'assets.downloadBinding',
    code: 'content:pages:manage',
  });
  expect(bindings.rows.filter((binding) => binding['collection_key'] === 'articles')).toEqual([
    {
      collection_key: 'articles',
      operation_id: 'assets.downloadBinding',
      code: 'content:articles:manage',
    },
  ]);
  expect(bindings.rows).toContainEqual({
    collection_key: 'media',
    operation_id: 'assets.createUpload',
    code: 'content:media:manage',
  });
  expect(
    (await store.database.query('SELECT count(*)::int AS total FROM role_permissions')).rows,
  ).toEqual([{ total: 0 }]);
});
