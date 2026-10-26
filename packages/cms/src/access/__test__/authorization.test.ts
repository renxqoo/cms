import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import { createFixture, context, initialPermission, invite, permission, role } from './support.ts';

const collectionRead: OperationDefinition = {
  id: 'access.test.collectionRead',
  module: 'access_test',
  method: 'GET',
  path: '/test/scopes/:collectionKey',
  access: 'permission',
  scopeKind: 'collection',
  bindingConfigurable: true,
};

test('operationId and collection scope isolate grants and super still needs a live binding', async () => {
  const fixture = await createFixture({ operations: [collectionRead] });
  const articles = await permission(fixture, {
    code: 'content:articles:read',
    scopeKind: 'collection',
    collectionKey: 'articles',
  });
  const pages = await permission(fixture, {
    code: 'content:pages:read',
    scopeKind: 'collection',
    collectionKey: 'pages',
  });
  const articleBinding = await fixture.access.api.createBinding(context(fixture.owner.token), {
    operationId: collectionRead.id,
    scopeKind: 'collection',
    collectionKey: 'articles',
    permissionId: articles.id,
  });
  await fixture.access.api.createBinding(context(fixture.owner.token), {
    operationId: collectionRead.id,
    scopeKind: 'collection',
    collectionKey: 'pages',
    permissionId: pages.id,
  });
  const editor = await role(fixture, { code: 'article_reader', permissionIds: [articles.id] });
  const member = await invite(fixture, { email: 'articles@example.test', roleId: editor.id });
  const read = (collectionKey: string) =>
    fixture.database.transaction((tx) =>
      fixture.access.authorize(tx, member.ctx, collectionRead.id, {
        scopeKind: 'collection',
        collectionKey,
      }),
    );
  expect(await read('articles')).toMatchObject({ id: member.admin.id });
  await expect(read('pages')).rejects.toMatchObject({ code: 'forbidden' });
  await expect(read('unknown')).rejects.toMatchObject({ code: 'invalid_scope' });
  await expect(
    fixture.access.api.createBinding(context(fixture.owner.token), {
      operationId: collectionRead.id,
      scopeKind: 'collection',
      collectionKey: 'pages',
      permissionId: articles.id,
    }),
  ).rejects.toMatchObject({ code: 'scope_mismatch' });
  await expect(
    fixture.database.transaction((tx) =>
      fixture.access.authorize(tx, fixture.owner, collectionRead.id),
    ),
  ).rejects.toMatchObject({ code: 'invalid_scope' });
  await fixture.access.api.deleteBinding(fixture.owner, { id: articleBinding.id, version: 1 });
  await expect(
    fixture.database.transaction((tx) =>
      fixture.access.authorize(tx, fixture.owner, collectionRead.id, {
        scopeKind: 'collection',
        collectionKey: 'articles',
      }),
    ),
  ).rejects.toMatchObject({ code: 'endpoint_unbound' });
});

test('empty grants deny management writes and reads before target existence can leak', async () => {
  const fixture = await createFixture();
  const reader = await role(fixture, { code: 'empty_reader' });
  const member = await invite(fixture, { email: 'empty@example.test', roleId: reader.id });
  await expect(fixture.access.api.getAdmin(member.ctx, { id: randomUUID() })).rejects.toMatchObject(
    { code: 'forbidden' },
  );
  await expect(
    fixture.access.api.getAdmin(member.ctx, { id: fixture.admin.id }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  await expect(
    fixture.access.api.createRole(member.ctx, { code: 'elevated', name: 'Elevated' }),
  ).rejects.toMatchObject({ code: 'forbidden' });
  expect(
    (await fixture.access.api.myOperations(member.ctx, { pageSize: 100 })).rows
      .map((item) => item.operationId)
      .toSorted(),
  ).toEqual(
    [
      'access.me',
      'access.myNavigation',
      'access.myOperations',
      'access.updateOwnProfile',
      'credentials.createKey',
      'credentials.decideAuthorization',
      'credentials.getAuthorization',
      'credentials.list',
      'credentials.revoke',
      'credentials.revokeClient',
      'identity.changePassword',
      'identity.logout',
    ].toSorted(),
  );
  expect(await fixture.access.api.me(member.ctx, {})).toMatchObject({
    id: member.admin.id,
    role: { isSuper: false },
  });
});

test('permission and role disabling affect the next request while own profile remains available', async () => {
  const fixture = await createFixture();
  const grant = await initialPermission(fixture, 'admins:read');
  const reader = await role(fixture, { code: 'reader', permissionIds: [grant.id] });
  const member = await invite(fixture, { email: 'reader@example.test', roleId: reader.id });
  expect((await fixture.access.api.listAdmins(member.ctx, {})).total).toBe(2);
  const disabled = await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: 1,
    status: 'disabled',
  });
  await expect(fixture.access.api.listAdmins(member.ctx, {})).rejects.toMatchObject({
    code: 'endpoint_unbound',
  });
  await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: disabled.version,
    status: 'active',
  });
  expect((await fixture.access.api.listAdmins(member.ctx, {})).total).toBe(2);
  await fixture.access.api.updateRole(fixture.owner, {
    id: reader.id,
    version: 1,
    status: 'disabled',
  });
  await expect(fixture.access.api.listAdmins(member.ctx, {})).rejects.toMatchObject({
    code: 'forbidden',
  });
  expect(await fixture.access.api.me(member.ctx, {})).toMatchObject({
    role: { status: 'disabled' },
  });
  const operations = await fixture.access.api.myOperations(member.ctx, { pageSize: 100 });
  expect(operations.rows.some((item) => item.operationId === 'admins.list')).toBe(false);
  expect(operations.rows.some((item) => item.operationId === 'identity.changePassword')).toBe(true);
});

test('catalog reconcile preserves intentional unbinding and only runtime registrations are visible', async () => {
  const fixture = await createFixture();
  const directory = await fixture.access.api.listEndpoints(fixture.owner, { pageSize: 100 });
  expect(directory.total).toBe(41);
  expect(directory.rows.find((item) => item.operationId === 'access.readRecovery')).toMatchObject({
    accessKind: 'security',
    bindingConfigurable: false,
    scopeKind: 'global',
    binding: null,
  });
  expect(
    directory.rows.some((item) => item.method === 'GET' && item.operationId === 'admins.list'),
  ).toBe(true);
  const row = directory.rows.find((item) => item.operationId === 'admins.list');
  if (!row?.binding) throw new Error('Initial binding missing');
  await fixture.access.api.deleteBinding(fixture.owner, {
    id: row.binding.id,
    version: row.binding.version,
  });
  await fixture.access.reconcile();
  await fixture.access.verifyReady();
  await expect(fixture.access.api.listAdmins(fixture.owner, {})).rejects.toMatchObject({
    code: 'endpoint_unbound',
  });
  const grant = await initialPermission(fixture, 'admins:read');
  await fixture.access.api.createBinding(context(fixture.owner.token), {
    operationId: 'admins.list',
    scopeKind: 'global',
    permissionId: grant.id,
  });
  expect((await fixture.access.api.listAdmins(fixture.owner, {})).total).toBe(1);
  await expect(
    fixture.access.api.createBinding(context(fixture.owner.token), {
      operationId: 'admins.list',
      scopeKind: 'global',
      permissionId: grant.id,
    }),
  ).rejects.toMatchObject({ code: 'binding_exists' });
  await expect(
    fixture.access.api.createBinding(context(fixture.owner.token), {
      operationId: 'access.me',
      scopeKind: 'global',
      permissionId: grant.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.createBinding(context(fixture.owner.token), {
      operationId: '/v1/free-url',
      scopeKind: 'global',
      permissionId: grant.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await fixture.database.query(
    "INSERT INTO operation_catalog(operation_id,module,method,path,access_kind,scope_kind,binding_configurable) VALUES('retired.test','test','GET','/retired','authenticated','global',false)",
  );
  expect((await fixture.access.api.listEndpoints(fixture.owner, { pageSize: 100 })).total).toBe(41);
  await expect(fixture.access.check(fixture.owner, 'retired.test')).rejects.toMatchObject({
    code: 'not_found',
  });
  await fixture.database.query("DELETE FROM operation_catalog WHERE operation_id='access.me'");
  await expect(fixture.access.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});

test('check enforces authenticated operation rate limits without trusting caller permission claims', async () => {
  const fixture = await createFixture({ policy: { userRateLimit: 1 } });
  await fixture.access.check(fixture.owner, 'access.me');
  await expect(fixture.access.check(fixture.owner, 'access.me')).rejects.toMatchObject({
    code: 'rate_limited',
  });
  await expect(fixture.access.check(context(), 'access.me')).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  const forged = { ...context(), token: 'forged', isSuper: true };
  await expect(fixture.access.api.listAdmins(forged, {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
});
