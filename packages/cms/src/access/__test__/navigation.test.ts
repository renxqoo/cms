import { expect, test } from 'vitest';
import { createFixture, context, initialPermission, invite, permission, role } from './support.ts';

test('navigation enforces parent types and route allowlists, hides empty groups and retains API permissions', async () => {
  const fixture = await createFixture();
  const grant = await initialPermission(fixture, 'admins:read');
  const reader = await role(fixture, { code: 'reader', permissionIds: [grant.id] });
  const member = await invite(fixture, { email: 'reader@example.test', roleId: reader.id });
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Workspace',
    visibility: 'container',
    icon: 'folder',
  });
  expect(await fixture.access.api.myNavigation(member.ctx, {})).toEqual({ rows: [] });
  await expect(
    fixture.access.api.createNavigation(context(fixture.owner.token), {
      type: 'group',
      name: 'Nested',
      parentId: group.id,
      visibility: 'container',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.createNavigation(context(fixture.owner.token), {
      type: 'page',
      name: 'Unknown',
      parentId: group.id,
      visibility: 'authenticated',
      path: '/unknown',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const page = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Accounts',
    parentId: group.id,
    visibility: 'permission',
    permissionId: grant.id,
    path: '/dashboard',
    icon: 'home',
  });
  const action = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'action',
    name: 'Inspect',
    parentId: page.id,
    visibility: 'permission',
    permissionId: grant.id,
  });
  expect(await fixture.access.api.myNavigation(member.ctx, {})).toEqual({
    rows: [
      {
        id: group.id,
        type: 'group',
        name: 'Workspace',
        path: null,
        icon: 'folder',
        children: [
          {
            id: page.id,
            type: 'page',
            name: 'Accounts',
            path: '/dashboard',
            icon: 'home',
            children: [
              {
                id: action.id,
                type: 'action',
                name: 'Inspect',
                path: null,
                icon: null,
                children: [],
              },
            ],
          },
        ],
      },
    ],
  });
  await expect(
    fixture.access.api.deleteNavigation(fixture.owner, { id: group.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await fixture.access.api.updateNavigation(fixture.owner, {
    id: group.id,
    version: 1,
    status: 'disabled',
  });
  expect(await fixture.access.api.myNavigation(member.ctx, {})).toEqual({ rows: [] });
  expect((await fixture.access.api.listAdmins(member.ctx, {})).total).toBe(2);
  expect(
    (await fixture.access.api.myOperations(member.ctx, { pageSize: 100 })).rows.some(
      (operation) => operation.operationId === 'admins.list',
    ),
  ).toBe(true);
});

test('navigation update validates final shape and children without resetting omitted fields', async () => {
  const fixture = await createFixture();
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Workspace',
    visibility: 'container',
    sortOrder: -10,
  });
  const page = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Overview',
    parentId: group.id,
    visibility: 'authenticated',
    path: '/dashboard',
    sortOrder: 7,
    icon: 'home',
  });
  const action = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'action',
    name: 'Action',
    parentId: page.id,
    visibility: 'authenticated',
  });
  const renamed = await fixture.access.api.updateNavigation(fixture.owner, {
    id: page.id,
    version: 1,
    name: 'New overview',
  });
  expect(renamed).toMatchObject({
    parentId: group.id,
    path: '/dashboard',
    sortOrder: 7,
    icon: 'home',
    version: 2,
  });
  await expect(
    fixture.access.api.updateNavigation(fixture.owner, {
      id: page.id,
      version: 2,
      type: 'group',
      parentId: null,
      path: null,
      visibility: 'container',
      icon: null,
    }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await expect(
    fixture.access.api.updateNavigation(fixture.owner, {
      id: group.id,
      version: 1,
      parentId: page.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.updateNavigation(fixture.owner, {
      id: action.id,
      version: 1,
      parentId: group.id,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await fixture.access.api.deleteNavigation(fixture.owner, { id: action.id, version: 1 });
  await fixture.access.api.deleteNavigation(fixture.owner, { id: page.id, version: 2 });
  await fixture.access.api.deleteNavigation(fixture.owner, { id: group.id, version: 1 });
  expect(await fixture.access.api.listNavigation(fixture.owner, {})).toEqual({ rows: [] });
});

test('menu permission disabling hides the branch for super too and references prevent permission deletion', async () => {
  const fixture = await createFixture();
  const grant = await permission(fixture, { code: 'screen:read' });
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Workspace',
    visibility: 'container',
  });
  await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Screen',
    parentId: group.id,
    path: '/dashboard',
    visibility: 'permission',
    permissionId: grant.id,
  });
  expect((await fixture.access.api.myNavigation(fixture.owner, {})).rows).toHaveLength(1);
  await expect(
    fixture.access.api.deletePermission(fixture.owner, { id: grant.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: 1,
    status: 'disabled',
  });
  expect(await fixture.access.api.myNavigation(fixture.owner, {})).toEqual({ rows: [] });
  const full = await fixture.access.api.listNavigation(fixture.owner, {});
  expect(full.rows[0]?.children).toHaveLength(1);
});
