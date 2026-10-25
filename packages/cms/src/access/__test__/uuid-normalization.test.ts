import { expect, test } from 'vitest';
import { createFixture, context, initialPermission, invite, role } from './support.ts';

test('uppercase self UUID cannot bypass protection when a second effective super exists', async () => {
  const fixture = await createFixture();
  await invite(fixture, { email: 'second-super@example.test', roleId: fixture.admin.roleId });
  const editor = await role(fixture, { code: 'editor' });
  const uppercaseId = fixture.admin.id.toUpperCase();
  for (const fields of [{ roleId: editor.id }, { status: 'disabled' }, { status: 'archived' }]) {
    await expect(
      fixture.access.api.updateAdmin(fixture.owner, {
        id: uppercaseId,
        version: fixture.admin.version,
        ...fields,
      }),
    ).rejects.toMatchObject({ code: 'protected_resource' });
  }
  expect(await fixture.access.api.getAdmin(fixture.owner, { id: uppercaseId })).toMatchObject({
    id: fixture.admin.id,
    roleId: fixture.admin.roleId,
    status: 'active',
    version: fixture.admin.version,
  });
});

test('uppercase UUID grants are unchanged, duplicate semantic IDs reject and replay fingerprints match', async () => {
  const fixture = await createFixture();
  const grant = await initialPermission(fixture, 'admins:read');
  const reviewer = await role(fixture, { code: 'reviewer', permissionIds: [grant.id] });
  const unchanged = await fixture.access.api.replaceRolePermissions(fixture.owner, {
    id: reviewer.id.toUpperCase(),
    version: 1,
    permissionIds: [grant.id.toUpperCase()],
  });
  expect(unchanged).toMatchObject({ id: reviewer.id, version: 1, permissionIds: [grant.id] });
  expect(
    (
      await fixture.access.api.listAuditLogs(fixture.owner, {
        operationId: 'roles.replacePermissions',
        targetId: reviewer.id,
      })
    ).total,
  ).toBe(0);
  await expect(
    fixture.access.api.replaceRolePermissions(fixture.owner, {
      id: reviewer.id,
      version: 1,
      permissionIds: [grant.id, grant.id.toUpperCase()],
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  const ctx = context(fixture.owner.token);
  const created = await fixture.access.api.createRole(ctx, {
    code: 'replay',
    name: 'Replay',
    permissionIds: [grant.id.toUpperCase()],
  });
  expect(
    await fixture.access.api.createRole(ctx, {
      code: 'replay',
      name: 'Replay',
      permissionIds: [grant.id],
    }),
  ).toEqual(created);
});

test('same UUID casing does not revoke account sessions or change navigation and binding versions', async () => {
  const fixture = await createFixture();
  const reader = await role(fixture, { code: 'reader' });
  const member = await invite(fixture, { email: 'member@example.test', roleId: reader.id });
  const unchanged = await fixture.access.api.updateAdmin(fixture.owner, {
    id: member.admin.id.toUpperCase(),
    version: member.admin.version,
    roleId: reader.id.toUpperCase(),
  });
  expect(unchanged.version).toBe(member.admin.version);
  expect(await fixture.access.api.me(member.ctx, {})).toMatchObject({ id: member.admin.id });
  const group = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'Group',
    visibility: 'container',
  });
  const page = await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'page',
    name: 'Page',
    path: '/dashboard',
    parentId: group.id.toUpperCase(),
    visibility: 'authenticated',
  });
  expect(
    await fixture.access.api.updateNavigation(fixture.owner, {
      id: page.id.toUpperCase(),
      version: 1,
      parentId: group.id.toUpperCase(),
    }),
  ).toEqual(page);
  const endpoints = await fixture.access.api.listEndpoints(fixture.owner, { pageSize: 100 });
  const binding = endpoints.rows.find((entry) => entry.operationId === 'admins.get')?.binding;
  if (!binding) throw new Error('Binding missing');
  const updated = await fixture.access.api.updateBinding(fixture.owner, {
    id: binding.id.toUpperCase(),
    version: binding.version,
    permissionId: binding.permissionId.toUpperCase(),
  });
  expect(updated).toMatchObject({
    id: binding.id,
    permissionId: binding.permissionId,
    version: binding.version,
  });
});
