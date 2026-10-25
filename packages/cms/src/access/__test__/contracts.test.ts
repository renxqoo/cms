import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { createAccess } from '../composition.ts';
import {
  createFixture,
  context,
  initialPermission,
  invite,
  password,
  permission,
  role,
} from './support.ts';

test('audit filters combine actor, target, operation, time and literal search with matching totals', async () => {
  const fixture = await createFixture();
  const reviewer = await role(fixture, { code: 'reviewer' });
  const result = await fixture.access.api.listAuditLogs(fixture.owner, {
    actorId: fixture.admin.id,
    operationId: 'roles.create',
    targetType: 'role',
    targetId: reviewer.id,
    from: '2000-01-01T00:00:00Z',
    to: '2100-01-01T00:00:00Z',
    q: 'roles.create',
    order: 'asc',
    pageSize: 1,
  });
  expect(result.total).toBe(1);
  expect(result.rows[0]).toMatchObject({
    actorId: fixture.admin.id,
    targetId: reviewer.id,
    operationId: 'roles.create',
  });
  expect((await fixture.access.api.listAuditLogs(fixture.owner, { q: '%_' })).total).toBe(0);
  await expect(
    fixture.access.api.listAuditLogs(fixture.owner, { from: 'invalid' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('all endpoint and operation pages are addressable while overlarge offsets are rejected', async () => {
  const fixture = await createFixture();
  const first = await fixture.access.api.listEndpoints(fixture.owner, {
    module: 'identity',
    accessKind: 'authenticated',
    pageSize: 1,
    page: 1,
  });
  const second = await fixture.access.api.listEndpoints(fixture.owner, {
    module: 'identity',
    accessKind: 'authenticated',
    pageSize: 1,
    page: 2,
  });
  expect(first.total).toBe(2);
  expect(second.total).toBe(2);
  expect([first.rows[0]?.operationId, second.rows[0]?.operationId]).toEqual([
    'identity.changePassword',
    'identity.logout',
  ]);
  expect(
    await fixture.access.api.listEndpoints(fixture.owner, { module: 'unknown' }),
  ).toMatchObject({ rows: [], total: 0 });
  const operations = await fixture.access.api.myOperations(fixture.owner, { pageSize: 100 });
  expect(operations.total).toBe(31);
  expect(operations.rows.some((operation) => operation.operationId === 'access.readRecovery')).toBe(
    true,
  );
  expect(operations.rows.some((operation) => operation.operationId === 'identity.login')).toBe(
    false,
  );
  expect(
    await fixture.access.api.myOperations(fixture.owner, { pageSize: 1, page: 32 }),
  ).toMatchObject({ rows: [], total: 31 });
  await expect(
    fixture.access.api.listEndpoints(fixture.owner, {
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 100,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.listRoles(fixture.owner, { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('registry rejects duplicate routes and ids, invalid categories and incompatible catalog reuse', async () => {
  const fixture = await createFixture();
  const { operations } = fixture.accessOptions;
  const [first] = operations;
  if (!first) throw new Error('Registration missing');
  expect(() =>
    createAccess({ ...fixture.accessOptions, operations: [...operations, first] }),
  ).toThrow('invalid input');
  expect(() =>
    createAccess({
      ...fixture.accessOptions,
      operations: [...operations, { ...first, id: 'duplicate.route' }],
    }),
  ).toThrow('invalid input');
  expect(() =>
    createAccess({ ...fixture.accessOptions, operations: [{ ...first, access: 'public' }] }),
  ).toThrow('invalid input');
  const { defaultPermission: _default, ...base } = first;
  const incompatible = createAccess({
    ...fixture.accessOptions,
    operations: [{ ...base, scopeKind: 'collection' }],
  });
  await expect(incompatible.reconcile()).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await expect(incompatible.verifyReady()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  const missingDefault = createAccess({
    ...fixture.accessOptions,
    operations: [
      ...operations,
      {
        id: 'new.missingDefault',
        module: 'access_test',
        method: 'GET',
        path: '/test/new',
        access: 'permission',
        scopeKind: 'global',
        bindingConfigurable: true,
      },
    ],
  });
  await expect(missingDefault.reconcile()).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  const absent = await fixture.database.query<{ count: string }>(
    "SELECT count(*) FROM operation_catalog WHERE operation_id='new.missingDefault'",
  );
  expect(Number(absent.rows[0]?.count)).toBe(0);
});

test('business entry points propagate cancellation and public checks do not require a session', async () => {
  const fixture = await createFixture();
  const controller = new AbortController();
  const ctx = { ...fixture.owner, signal: controller.signal };
  await fixture.access.check(ctx, 'access.me');
  expect(await fixture.access.api.me(ctx, {})).toMatchObject({ id: fixture.admin.id });
  await fixture.access.check(context(), 'identity.login');
  controller.abort();
  await expect(fixture.access.api.me(ctx, {})).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  await expect(fixture.access.check(ctx, 'access.me')).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});

test('missing targets and duplicate identifiers never produce phantom resources', async () => {
  const fixture = await createFixture();
  const reviewer = await role(fixture, { code: 'reviewer' });
  await expect(role(fixture, { code: 'reviewer' })).rejects.toMatchObject({
    code: 'identifier_taken',
  });
  await expect(
    fixture.access.api.getRole(fixture.owner, { id: randomUUID() }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    fixture.access.api.getAdmin(fixture.owner, { id: randomUUID() }),
  ).rejects.toMatchObject({ code: 'not_found' });
  await expect(
    fixture.access.api.updateAdmin(fixture.owner, {
      id: randomUUID(),
      version: 1,
      displayName: 'Unknown',
    }),
  ).rejects.toMatchObject({ code: 'not_found' });
  const noChange = await fixture.access.api.replaceRolePermissions(fixture.owner, {
    id: reviewer.id,
    version: 1,
    permissionIds: [],
  });
  expect(noChange.version).toBe(1);
  const grant = await permission(fixture, { code: 'sample:read' });
  expect(
    await fixture.access.api.updatePermission(fixture.owner, {
      id: grant.id,
      version: 1,
      name: grant.name,
    }),
  ).toEqual(grant);
  await expect(
    fixture.access.api.updatePermission(fixture.owner, { id: grant.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await fixture.access.api.updateRole(fixture.owner, {
    id: reviewer.id,
    version: 1,
    status: 'disabled',
  });
  await expect(
    fixture.access.api.createAdmin(context(fixture.owner.token), {
      email: 'disabled-role@example.test',
      roleId: reviewer.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('menu visibility keeps authenticated pages while a disabled role loses permission pages', async () => {
  const fixture = await createFixture();
  const grant = await initialPermission(fixture, 'admins:read');
  const reviewer = await role(fixture, { code: 'reviewer' });
  const member = await invite(fixture, { email: 'member@example.test', roleId: reviewer.id });
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Workspace',
    visibility: 'container',
  });
  const page = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Public to admins',
    path: '/dashboard',
    parentId: group.id,
    visibility: 'authenticated',
    sortOrder: -1,
  });
  const restricted = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Restricted',
    path: '/articles',
    parentId: group.id,
    visibility: 'permission',
    permissionId: grant.id,
    sortOrder: 1,
  });
  expect(
    (await fixture.access.api.myNavigation(member.ctx, {})).rows[0]?.children.map(
      (item) => item.id,
    ),
  ).toEqual([page.id]);
  expect(
    (await fixture.access.api.myNavigation(fixture.owner, {})).rows[0]?.children.map(
      (item) => item.id,
    ),
  ).toEqual([page.id, restricted.id]);
  await fixture.access.api.updateRole(fixture.owner, {
    id: reviewer.id,
    version: 1,
    status: 'disabled',
  });
  expect(
    (await fixture.access.api.myNavigation(member.ctx, {})).rows[0]?.children.map(
      (item) => item.id,
    ),
  ).toEqual([page.id]);
  const unchanged = await fixture.access.api.updateNavigation(fixture.owner, {
    id: page.id,
    version: 1,
    name: page.name,
  });
  expect(unchanged).toEqual(page);
  await expect(
    fixture.access.api.updateNavigation(fixture.owner, { id: page.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('navigation rejects every invalid shape, unknown icon and invalid permission reference', async () => {
  const fixture = await createFixture();
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Workspace',
    visibility: 'container',
  });
  const page = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Page',
    parentId: group.id,
    path: '/dashboard',
    visibility: 'authenticated',
  });
  const values = [
    { type: 'group', visibility: 'authenticated' },
    { type: 'group', visibility: 'container', path: '/dashboard' },
    { type: 'group', visibility: 'container', icon: 'unknown' },
    { type: 'page', visibility: 'authenticated', path: '/dashboard' },
    { type: 'page', visibility: 'container', parentId: group.id, path: '/dashboard' },
    { type: 'page', visibility: 'authenticated', parentId: group.id },
    { type: 'action', visibility: 'authenticated', parentId: page.id, path: '/dashboard' },
    { type: 'action', visibility: 'authenticated', parentId: page.id, icon: 'home' },
    { type: 'page', visibility: 'permission', parentId: group.id, path: '/dashboard' },
    {
      type: 'page',
      visibility: 'authenticated',
      parentId: group.id,
      path: '/dashboard',
      permissionId: randomUUID(),
    },
    {
      type: 'page',
      visibility: 'permission',
      parentId: group.id,
      path: '/dashboard',
      permissionId: randomUUID(),
    },
  ];
  for (const value of values)
    await expect(
      fixture.access.api.createNavigation(context(fixture.owner.token), {
        name: 'Invalid',
        ...value,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  const grant = await permission(fixture, { code: 'screen:read' });
  await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: 1,
    status: 'disabled',
  });
  await expect(
    fixture.access.api.createNavigation(context(fixture.owner.token), {
      type: 'page',
      name: 'Invalid',
      parentId: group.id,
      path: '/dashboard',
      visibility: 'permission',
      permissionId: grant.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('initializer fails closed when the protected super role is missing', async () => {
  const fixture = await createFixture();
  await fixture.database.query("UPDATE roles SET is_super=false,code='ordinary' WHERE id=$1", [
    fixture.admin.roleId,
  ]);
  await expect(
    fixture.access.initializeAdmin({ email: 'new@example.test', password }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  const count = await fixture.database.query<{ count: string }>(
    "SELECT count(*) FROM admins WHERE email='new@example.test'",
  );
  expect(Number(count.rows[0]?.count)).toBe(0);
});
