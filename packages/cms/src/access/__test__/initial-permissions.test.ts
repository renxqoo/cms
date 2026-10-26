import { randomUUID } from 'node:crypto';
import { afterEach, expect, it } from 'vitest';
import { createTestDatabase } from '../../../../../test/support/database.ts';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createAccessCatalog } from '../composition.ts';
import type { InitialCollectionPermission } from '../composition.ts';
import { accessOperations } from '../operations.ts';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

const stores: Awaited<ReturnType<typeof createTestDatabase>>[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
});

const read: OperationDefinition = {
  id: 'example.read',
  module: 'example',
  method: 'GET',
  path: '/example/:collection',
  access: 'permission',
  scopeKind: 'collection',
  bindingConfigurable: true,
};
const initial: InitialCollectionPermission = {
  collectionKey: 'articles',
  code: 'articles:manage',
  name: 'Manage articles',
  operationIds: [read.id],
};

async function fixture(permissions: readonly InitialCollectionPermission[] = [initial]) {
  const store = await createTestDatabase();
  stores.push(store);
  const options = {
    database: store.database,
    policy: createTestPolicy(),
    operations: [...accessOperations, read],
    collectionKeys: ['articles', 'pages'],
    initialCollectionPermissions: permissions,
  };
  return { ...store, options, catalog: createAccessCatalog(options) };
}

it('concurrent first initialization creates one permission, one binding and one system audit without granting a role', async () => {
  const kit = await fixture();
  await Promise.all([kit.catalog.reconcile(), kit.catalog.reconcile()]);
  await kit.catalog.verifyReady();
  const result = await kit.database.query(
    `SELECT (SELECT count(*)::int FROM permissions WHERE code='articles:manage') AS permissions,
      (SELECT count(*)::int FROM endpoint_bindings WHERE operation_id='example.read') AS bindings,
      (SELECT count(*)::int FROM audit_events WHERE actor_kind='system' AND operation_id='access.initializeCollectionPermissions') AS audit,
      (SELECT count(*)::int FROM role_permissions) AS grants`,
  );
  expect(result.rows).toEqual([{ permissions: 1, bindings: 1, audit: 1, grants: 0 }]);
});

it.each([
  { permissions: [{ ...initial, collectionKey: 'unknown' }], error: 'invalid_scope' },
  { permissions: [{ ...initial, operationIds: ['admins.create'] }], error: 'invalid_input' },
  { permissions: [{ ...initial, operationIds: ['missing.operation'] }], error: 'invalid_input' },
  { permissions: [{ ...initial, operationIds: [read.id, read.id] }], error: 'invalid_input' },
  { permissions: [initial, { ...initial, code: 'articles:second' }], error: 'invalid_input' },
  { permissions: [initial, { ...initial, collectionKey: 'pages' }], error: 'invalid_input' },
])(
  'rejects invalid initial scopes or operations and rolls back the entire catalog: %j',
  async ({ permissions, error }) => {
    const kit = await fixture(permissions);
    await expect(kit.catalog.reconcile()).rejects.toMatchObject({
      code: error,
    });
    const result = await kit.database.query(
      'SELECT (SELECT count(*)::int FROM operation_catalog) AS operations,(SELECT count(*)::int FROM permissions) AS permissions,(SELECT count(*)::int FROM audit_events) AS audit',
    );
    expect(result.rows).toEqual([{ operations: 0, permissions: 0, audit: 0 }]);
  },
);

it.each([
  { scope: 'global', collection: null, status: 'active', error: 'scope_mismatch' },
  { scope: 'collection', collection: 'articles', status: 'disabled', error: 'invalid_input' },
])(
  'preserves an existing incompatible permission instead of changing its scope or status: %j',
  async (existing) => {
    const kit = await fixture();
    await kit.database.query(
      'INSERT INTO permissions(id,code,name,scope_kind,collection_key,status) VALUES($1,$2,$3,$4,$5,$6)',
      [
        randomUUID(),
        initial.code,
        'Existing policy',
        existing.scope,
        existing.collection,
        existing.status,
      ],
    );
    await expect(kit.catalog.reconcile()).rejects.toMatchObject({ code: existing.error });
    const result = await kit.database.query(
      'SELECT name,scope_kind,status FROM permissions WHERE code=$1',
      [initial.code],
    );
    expect(result.rows).toEqual([
      { name: 'Existing policy', scope_kind: existing.scope, status: existing.status },
    ]);
    expect(
      (await kit.database.query('SELECT count(*)::int AS count FROM operation_catalog')).rows,
    ).toEqual([{ count: 0 }]);
  },
);

it('rolls back catalog and permissions when the configured permission budget cannot admit initialization', async () => {
  const kit = await fixture();
  const catalog = createAccessCatalog({
    ...kit.options,
    policy: { ...kit.options.policy, maxPermissions: 1 },
  });
  await expect(catalog.reconcile()).rejects.toMatchObject({ code: 'capacity_exceeded' });
  expect((await kit.database.query('SELECT count(*)::int AS count FROM permissions')).rows).toEqual(
    [{ count: 0 }],
  );
});
