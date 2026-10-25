import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { createFixture, context, initialPermission, permission, role } from './support.ts';

test('me role contains only the published role projection and create admin keeps delivery separate', async () => {
  const fixture = await createFixture();
  const me = await fixture.access.api.me(fixture.owner, {});
  expect(Object.keys(me.role).toSorted()).toEqual(
    ['id', 'code', 'name', 'status', 'isSuper'].toSorted(),
  );
  const editor = await role(fixture, { code: 'editor' });
  const created = await fixture.access.api.createAdmin(context(fixture.owner.token), {
    email: 'pending@example.test',
    roleId: editor.id,
  });
  expect(created.admin).not.toHaveProperty('invitationDelivery');
  expect(created).toHaveProperty('delivery.id');
});

test('audit range rejects a later fractional second before an earlier whole second', async () => {
  const fixture = await createFixture();
  await expect(
    fixture.access.api.listAuditLogs(fixture.owner, {
      from: '2026-10-25T00:00:00.100Z',
      to: '2026-10-25T00:00:00Z',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('audit range accepts a whole second before a later fractional second', async () => {
  const fixture = await createFixture();
  await expect(
    fixture.access.api.listAuditLogs(fixture.owner, {
      from: '2000-01-01T00:00:00Z',
      to: '2000-01-01T00:00:00.100Z',
    }),
  ).resolves.toMatchObject({ rows: [], total: 0 });
});

test('management resource and role grant capacity errors use the published capacity contract', async () => {
  const fixture = await createFixture({
    policy: { maxRoles: 2, maxPermissions: 6, maxNavigationNodes: 1, maxRolePermissions: 1 },
  });
  const first = await role(fixture, { code: 'first' });
  await expect(role(fixture, { code: 'second' })).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  await expect(permission(fixture, { code: 'extra:read' })).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  await fixture.access.api.createNavigation(context(fixture.owner.token), {
    type: 'group',
    name: 'One',
    visibility: 'container',
  });
  await expect(
    fixture.access.api.createNavigation(context(fixture.owner.token), {
      type: 'group',
      name: 'Two',
      visibility: 'container',
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
  await expect(
    fixture.access.api.replaceRolePermissions(fixture.owner, {
      id: first.id,
      version: 1,
      permissionIds: [randomUUID(), randomUUID()],
    }),
  ).rejects.toMatchObject({ code: 'capacity_exceeded' });
});

test('scope shape failures return invalid scope and do not store inconsistent permission identities', async () => {
  const fixture = await createFixture();
  for (const scope of [
    { scopeKind: 'global', collectionKey: 'articles' },
    { scopeKind: 'collection' },
    { scopeKind: 'collection', collectionKey: 'Unknown' },
    { scopeKind: 'collection', collectionKey: 'unknown' },
  ]) {
    await expect(
      fixture.access.api.createPermission(context(fixture.owner.token), {
        code: `invalid:p_${randomUUID()}`,
        name: 'Invalid',
        ...scope,
      }),
    ).rejects.toMatchObject({ code: 'invalid_scope' });
  }
  await expect(
    fixture.access.api.listPermissions(fixture.owner, {
      scopeKind: 'global',
      collectionKey: 'articles',
    }),
  ).rejects.toMatchObject({ code: 'invalid_scope' });
});

test('display text resembling a bearer phrase is accepted and audit keeps only safe changed fields', async () => {
  const fixture = await createFixture();
  const editor = await role(fixture, { code: 'editor' });
  const updated = await fixture.access.api.updateRole(fixture.owner, {
    id: editor.id,
    version: 1,
    name: 'Bearer Team',
  });
  expect(updated.name).toBe('Bearer Team');
  const created = await fixture.access.api.createPermission(context(fixture.owner.token), {
    code: 'sample:read',
    name: 'Bearer Tools',
    description: 'Password reset documentation',
    scopeKind: 'global',
  });
  expect(created.description).toBe('Password reset documentation');
  const logs = await fixture.access.api.listAuditLogs(fixture.owner, {
    operationId: 'roles.update',
    targetId: editor.id,
  });
  expect(logs.rows[0]?.detail).toEqual({ changedFields: ['name'] });
});

test('binding updates compare version, respect immutable scope and keep referenced permissions protected', async () => {
  const fixture = await createFixture();
  const original = await initialPermission(fixture, 'admins:read');
  const replacement = await permission(fixture, { code: 'review:read' });
  const directory = await fixture.access.api.listEndpoints(fixture.owner, { pageSize: 100 });
  const binding = directory.rows.find((entry) => entry.operationId === 'admins.get')?.binding;
  if (!binding) throw new Error('Binding missing');
  const changed = await fixture.access.api.updateBinding(fixture.owner, {
    id: binding.id,
    version: 1,
    permissionId: replacement.id,
  });
  expect(changed.version).toBe(2);
  expect(
    await fixture.access.api.updateBinding(fixture.owner, {
      id: binding.id,
      version: 2,
      permissionId: replacement.id,
    }),
  ).toEqual(changed);
  await expect(
    fixture.access.api.updateBinding(fixture.owner, {
      id: binding.id,
      version: 1,
      permissionId: original.id,
    }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await expect(
    fixture.access.api.updateBinding(fixture.owner, {
      id: binding.id,
      version: 2,
      permissionId: original.id,
      operationId: 'roles.get',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.deletePermission(fixture.owner, { id: replacement.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await fixture.access.api.deleteBinding(fixture.owner, { id: binding.id, version: 2 });
  await fixture.access.api.deletePermission(fixture.owner, { id: replacement.id, version: 1 });
});
