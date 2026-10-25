import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { Database } from '@new-cms/database/client';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { createAccess } from '../composition.ts';
import { recoveryPageSchema } from '../recovery/contracts.ts';
import { createFixture, context, permission, role } from './support.ts';

const collectionOperation: OperationDefinition = {
  id: 'sample.read',
  module: 'sample',
  method: 'GET',
  path: '/v1/:collection/sample',
  scopeKind: 'collection',
  access: 'permission',
  bindingConfigurable: true,
};

test('recovery catalog keeps global null scope, includes unbound operations and paginates collection scopes', async () => {
  const fixture = await createFixture({ operations: [collectionOperation] });
  const global = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'endpoints',
    operationId: 'access.readRecovery',
  });
  expect(global).toEqual({
    resource: 'endpoints',
    total: 1,
    page: 1,
    pageSize: fixture.policy.defaultPageSize,
    rows: [
      {
        operationId: 'access.readRecovery',
        module: 'access',
        method: 'GET',
        path: '/v1/security/recovery',
        scopeKind: 'global',
        collectionKey: null,
        accessKind: 'security',
        bindingConfigurable: false,
        binding: null,
      },
    ],
  });
  const grant = await permission(fixture, {
    code: 'sample:read',
    scopeKind: 'collection',
    collectionKey: 'pages',
  });
  const binding = await fixture.access.api.createBinding(context(fixture.owner.token), {
    operationId: 'sample.read',
    scopeKind: 'collection',
    collectionKey: 'pages',
    permissionId: grant.id,
  });
  const first = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'endpoints',
    module: 'sample',
    pageSize: 1,
  });
  expect(first).toMatchObject({
    total: 2,
    page: 1,
    pageSize: 1,
    rows: [{ collectionKey: 'articles', binding: null }],
  });
  const second = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'endpoints',
    module: 'sample',
    pageSize: 1,
    page: 2,
  });
  expect(second).toMatchObject({
    total: 2,
    rows: [
      { collectionKey: 'pages', binding: { id: binding.id, permissionId: grant.id, version: 1 } },
    ],
  });
  await expect(
    fixture.access.api.readRecovery(fixture.owner, {
      resource: 'endpoints',
      module: 'sample',
      pageSize: 1,
      page: 3,
    }),
  ).resolves.toMatchObject({ total: 2, rows: [] });
  await expect(
    fixture.access.api.readRecovery(fixture.owner, {
      resource: 'endpoints',
      scopeKind: 'global',
      module: 'sample',
    }),
  ).resolves.toMatchObject({ total: 0, rows: [] });
  await expect(
    fixture.access.api.readRecovery(fixture.owner, {
      resource: 'endpoints',
      operationId: 'sample.read',
      scopeKind: 'collection',
      collectionKey: 'pages',
    }),
  ).resolves.toMatchObject({ total: 1, rows: [{ collectionKey: 'pages' }] });
  await expect(
    fixture.access.api.readRecovery(fixture.owner, {
      resource: 'endpoints',
      scopeKind: 'collection',
      collectionKey: 'removed',
    }),
  ).resolves.toMatchObject({ total: 0, rows: [] });
});

test('recovery retains orphan bindings and disabled permissions for removed collections without broadening writes', async () => {
  const fixture = await createFixture({ operations: [collectionOperation] });
  const grant = await permission(fixture, {
    code: 'old:read',
    scopeKind: 'collection',
    collectionKey: 'articles',
  });
  const binding = await fixture.access.api.createBinding(context(fixture.owner.token), {
    operationId: 'sample.read',
    scopeKind: 'collection',
    collectionKey: 'articles',
    permissionId: grant.id,
  });
  const disabled = await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: 1,
    status: 'disabled',
  });
  const access = createAccess({
    ...fixture.accessOptions,
    operations: fixture.accessOptions.operations.filter(
      (operation) => operation.id !== 'sample.read',
    ),
    collectionKeys: ['pages'],
  });
  await expect(
    access.api.readRecovery(fixture.owner, {
      resource: 'bindings',
      operationId: 'sample.read',
      permissionId: grant.id,
      scopeKind: 'collection',
      collectionKey: 'articles',
    }),
  ).resolves.toEqual({
    resource: 'bindings',
    rows: [binding],
    total: 1,
    page: 1,
    pageSize: fixture.policy.defaultPageSize,
  });
  await expect(
    access.api.readRecovery(fixture.owner, {
      resource: 'permissions',
      id: grant.id.toUpperCase(),
      status: 'disabled',
      scopeKind: 'collection',
      collectionKey: 'articles',
    }),
  ).resolves.toMatchObject({ resource: 'permissions', rows: [disabled], total: 1 });
  await expect(
    access.api.readRecovery(fixture.owner, { resource: 'endpoints', operationId: 'sample.read' }),
  ).resolves.toMatchObject({ total: 0, rows: [] });
  await expect(
    access.api.createBinding(context(fixture.owner.token), {
      operationId: 'sample.read',
      scopeKind: 'collection',
      collectionKey: 'articles',
      permissionId: grant.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_scope' });
});

function instrument(database: Database, statements: string[]): Database {
  return {
    ...database,
    transaction: (work, signal) =>
      database.transaction(
        (tx) =>
          work({
            query: (text, values) => {
              statements.push(text);
              return tx.query(text, values);
            },
          }),
        signal,
      ),
  };
}

test('recovery persistent filtering, total and page stay in one SQL snapshot with bounded queries and fixed ordering', async () => {
  const fixture = await createFixture({
    operations: [collectionOperation],
    policy: { defaultPageSize: 2 },
  });
  const ids = Array.from({ length: 203 }, () => randomUUID())
    .toSorted()
    .toReversed();
  await fixture.database.query(
    "INSERT INTO permissions(id,code,name,status,scope_kind,created_at,updated_at) SELECT id,'bulk:p_'||ordinal,'Bulk','disabled','global','2026-01-01','2026-01-01' FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id,ordinal)",
    [ids],
  );
  await fixture.database.query(
    "INSERT INTO operation_catalog(operation_id,module,method,path,access_kind,scope_kind,binding_configurable) SELECT 'removed.'||ordinal,'removed','GET','/removed/'||ordinal,'permission','global',true FROM generate_series(1,203) AS t(ordinal)",
  );
  await fixture.database.query(
    "INSERT INTO endpoint_bindings(id,operation_id,scope_kind,permission_id,created_at,updated_at) SELECT id,'removed.'||ordinal,'global',$2,'2026-01-01','2026-01-01' FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id,ordinal)",
    [ids, ids[0]],
  );
  const statements: string[] = [];
  const access = createAccess({
    ...fixture.accessOptions,
    database: instrument(fixture.database, statements),
  });
  const first = await access.api.readRecovery(fixture.owner, {
    resource: 'permissions',
    status: 'disabled',
    pageSize: 2,
  });
  if (first.resource !== 'permissions') throw new Error('Unexpected resource');
  expect(first.rows.map((row) => row.id)).toEqual(ids.slice(0, 2));
  expect(first).toMatchObject({ total: 203, page: 1, pageSize: 2 });
  const count = statements.length;
  expect(statements.filter((sql) => sql.includes('FROM permissions'))).toHaveLength(1);
  statements.length = 0;
  const last = await access.api.readRecovery(fixture.owner, {
    resource: 'permissions',
    status: 'disabled',
    page: 103,
  });
  expect(last).toMatchObject({ total: 203, page: 103, rows: [] });
  expect(statements.length).toBe(count);
  expect(statements.length).toBeLessThanOrEqual(6);
  statements.length = 0;
  const bindings = await access.api.readRecovery(fixture.owner, {
    resource: 'bindings',
    permissionId: ids[0],
    pageSize: 2,
  });
  if (bindings.resource !== 'bindings') throw new Error('Unexpected resource');
  expect(bindings.rows.map((row) => row.id)).toEqual(ids.slice(0, 2));
  expect(bindings.total).toBe(203);
  expect(statements.length).toBe(count);
  statements.length = 0;
  await expect(
    access.api.readRecovery(fixture.owner, {
      resource: 'bindings',
      permissionId: ids[0],
      page: 103,
    }),
  ).resolves.toMatchObject({ total: 203, rows: [] });
  expect(statements.length).toBe(count);
  const selected = await access.api.readRecovery(fixture.owner, {
    resource: 'bindings',
    id: ids[0]?.toUpperCase(),
  });
  expect(selected).toMatchObject({
    total: 1,
    rows: [{ id: ids[0], operationId: 'removed.1', scopeKind: 'global', collectionKey: null }],
  });

  statements.length = 0;
  await access.api.readRecovery(fixture.owner, { resource: 'endpoints', pageSize: 100 });
  expect(statements.filter((sql) => sql.includes('JOIN endpoint_bindings'))).toHaveLength(1);
  expect(statements.length).toBeLessThanOrEqual(6);
  expect(recoveryPageSchema.safeParse(first).success).toBe(true);
});

test('recovery repairs deleted self binding and disabled read permission while preserving CAS and reference protection', async () => {
  const fixture = await createFixture();
  const directory = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'endpoints',
    operationId: 'endpoints.list',
  });
  if (directory.resource !== 'endpoints') throw new Error('Unexpected resource');
  const binding = directory.rows[0]?.binding;
  if (!binding) throw new Error('Expected binding');
  const reader = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'permissions',
    id: binding.permissionId,
  });
  if (reader.resource !== 'permissions' || !reader.rows[0]) throw new Error('Expected permission');
  const [grant] = reader.rows;
  await expect(
    fixture.access.api.deletePermission(fixture.owner, { id: grant.id, version: grant.version }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await fixture.access.api.deleteBinding(fixture.owner, {
    id: binding.id,
    version: binding.version,
  });
  await expect(fixture.access.api.listEndpoints(fixture.owner, {})).rejects.toMatchObject({
    code: 'endpoint_unbound',
  });
  await expect(
    fixture.access.api.readRecovery(fixture.owner, {
      resource: 'endpoints',
      operationId: 'endpoints.list',
    }),
  ).resolves.toMatchObject({ rows: [{ binding: null }] });
  const ctx = context(fixture.owner.token);
  const restored = await fixture.access.api.createBinding(ctx, {
    operationId: 'endpoints.list',
    scopeKind: 'global',
    permissionId: grant.id,
  });
  expect(
    await fixture.access.api.createBinding(ctx, {
      operationId: 'endpoints.list',
      scopeKind: 'global',
      permissionId: grant.id,
    }),
  ).toEqual(restored);
  await expect(fixture.access.api.listEndpoints(fixture.owner, {})).resolves.toHaveProperty('rows');
  const readGrant = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'permissions',
    code: 'permissions:read',
  });
  if (readGrant.resource !== 'permissions' || !readGrant.rows[0])
    throw new Error('Expected read permission');
  const [original] = readGrant.rows;
  await fixture.access.api.updatePermission(fixture.owner, {
    id: original.id,
    version: original.version,
    status: 'disabled',
  });
  await expect(fixture.access.api.listPermissions(fixture.owner, {})).rejects.toMatchObject({
    code: 'endpoint_unbound',
  });
  const repair = await fixture.access.api.readRecovery(fixture.owner, {
    resource: 'permissions',
    id: original.id,
  });
  if (repair.resource !== 'permissions' || !repair.rows[0])
    throw new Error('Expected repair permission');
  await expect(
    fixture.access.api.updatePermission(fixture.owner, {
      id: original.id,
      version: original.version,
      status: 'active',
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await fixture.access.api.updatePermission(fixture.owner, {
    id: original.id,
    version: repair.rows[0].version,
    status: 'active',
  });
  await expect(fixture.access.api.listPermissions(fixture.owner, {})).resolves.toHaveProperty(
    'rows',
  );
  const roleGrant = await role(fixture, { code: 'grant', permissionIds: [grant.id] });
  await fixture.access.api.deleteBinding(fixture.owner, {
    id: restored.id,
    version: restored.version,
  });
  await expect(
    fixture.access.api.deletePermission(fixture.owner, { id: grant.id, version: grant.version }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await fixture.access.api.replaceRolePermissions(fixture.owner, {
    id: roleGrant.id,
    version: roleGrant.version,
    permissionIds: [],
  });
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Recovery',
    visibility: 'container',
  });
  const action = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    path: '/dashboard',
    parentId: group.id,
    name: 'Read endpoints',
    visibility: 'permission',
    permissionId: grant.id,
  });
  await expect(
    fixture.access.api.deletePermission(fixture.owner, { id: grant.id, version: grant.version }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await fixture.access.api.deleteNavigation(fixture.owner, {
    id: action.id,
    version: action.version,
  });
  await fixture.access.api.deletePermission(fixture.owner, {
    id: grant.id,
    version: grant.version,
  });
  await expect(
    fixture.access.api.readRecovery(fixture.owner, { resource: 'permissions', id: grant.id }),
  ).resolves.toMatchObject({ total: 0, rows: [] });
  const replacement = await fixture.access.api.createPermission(context(fixture.owner.token), {
    code: grant.code,
    name: grant.name,
    scopeKind: 'global',
  });
  expect(replacement.id).not.toBe(grant.id);
  await fixture.access.api.createBinding(context(fixture.owner.token), {
    operationId: 'endpoints.list',
    scopeKind: 'global',
    permissionId: replacement.id,
  });
  await expect(fixture.access.api.listEndpoints(fixture.owner, {})).resolves.toHaveProperty('rows');
});

test('recovery catalog intersects offset arithmetically and batches only one page across a large registry scope product', async () => {
  const operations = Array.from({ length: 40 }, (_, index) => ({
    ...collectionOperation,
    id: `sample.bulk_${String(index).padStart(2, '0')}`,
    path: `/v1/:collection/bulk-${index}`,
  }));
  const fixture = await createFixture({ operations });
  const statements: string[] = [];
  const access = createAccess({
    ...fixture.accessOptions,
    database: instrument(fixture.database, statements),
    collectionKeys: Array.from(
      { length: 9000 },
      (_, index) => `scope_${String(index).padStart(4, '0')}`,
    ),
  });
  const last = await access.api.readRecovery(fixture.owner, {
    resource: 'endpoints',
    module: 'sample',
    pageSize: 100,
    page: 3600,
  });
  expect(last).toMatchObject({ total: 360000, page: 3600, pageSize: 100 });
  expect(last.rows).toHaveLength(100);
  expect(last.rows[0]).toMatchObject({
    operationId: 'sample.bulk_39',
    collectionKey: 'scope_8900',
    binding: null,
  });
  expect(last.rows.at(-1)).toMatchObject({
    operationId: 'sample.bulk_39',
    collectionKey: 'scope_8999',
  });
  expect(statements.filter((sql) => sql.includes('JOIN endpoint_bindings'))).toHaveLength(1);
  expect(statements.length).toBeLessThanOrEqual(6);
  statements.length = 0;
  await expect(
    access.api.readRecovery(fixture.owner, {
      resource: 'endpoints',
      module: 'sample',
      pageSize: 100,
      page: 3601,
    }),
  ).resolves.toMatchObject({ total: 360000, rows: [] });
  expect(statements.some((sql) => sql.includes('endpoint_bindings'))).toBe(false);
});
