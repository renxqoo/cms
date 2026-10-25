import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import {
  createFixture,
  context,
  initialPermission,
  invite,
  password,
  permission,
  role,
} from './support.ts';

test('role and permission CRUD preserve immutable identities, versions, references and literal search', async () => {
  const fixture = await createFixture();
  const grant = await permission(fixture, { code: 'sample:read' });
  const editor = await role(fixture, { code: 'editor', permissionIds: [grant.id] });
  expect(editor.permissionIds).toEqual([grant.id]);
  expect(editor.version).toBe(1);
  const noop = await fixture.access.api.updateRole(fixture.owner, {
    id: editor.id,
    version: 1,
    name: 'editor',
  });
  expect(noop.version).toBe(1);
  const update = await fixture.access.api.updateRole(fixture.owner, {
    id: editor.id,
    version: 1,
    name: 'Literal %_ role',
  });
  expect(update.version).toBe(2);
  await expect(
    fixture.access.api.updateRole(fixture.owner, { id: editor.id, version: 1, name: 'Stale' }),
  ).rejects.toMatchObject({ code: 'version_conflict' });
  await expect(
    fixture.access.api.updateRole(fixture.owner, { id: editor.id, version: 2, code: 'changed' }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.updateRole(fixture.owner, { id: editor.id, version: 2 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.deletePermission(fixture.owner, { id: grant.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  expect(
    (await fixture.access.api.listRoles(fixture.owner, { q: '%_' })).rows.map((item) => item.id),
  ).toEqual([editor.id]);
  const removed = await fixture.access.api.replaceRolePermissions(fixture.owner, {
    id: editor.id,
    version: 2,
    permissionIds: [],
  });
  expect(removed).toMatchObject({ version: 3, permissionIds: [] });
  await fixture.access.api.deleteRole(fixture.owner, { id: editor.id, version: 3 });
  const changed = await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: 1,
    name: 'Readable',
  });
  expect(changed).toMatchObject({ version: 2, code: 'sample:read' });
  await expect(
    fixture.access.api.updatePermission(fixture.owner, {
      id: grant.id,
      version: 2,
      scopeKind: 'collection',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await fixture.access.api.deletePermission(fixture.owner, { id: grant.id, version: 2 });
  expect(
    (await fixture.access.api.listPermissions(fixture.owner, { q: 'sample:read' })).total,
  ).toBe(0);
});

test('role grants reject duplicates, missing and disabled permissions without changing stored grants', async () => {
  const fixture = await createFixture();
  const grant = await permission(fixture, { code: 'sample:read' });
  const editor = await role(fixture, { code: 'editor', permissionIds: [grant.id] });
  for (const permissionIds of [[grant.id, grant.id], [randomUUID()]]) {
    await expect(
      fixture.access.api.replaceRolePermissions(fixture.owner, {
        id: editor.id,
        version: 1,
        permissionIds,
      }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  }
  await fixture.access.api.updatePermission(fixture.owner, {
    id: grant.id,
    version: 1,
    status: 'disabled',
  });
  await expect(
    role(fixture, { code: 'disabled_grant', permissionIds: [grant.id] }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  expect(
    (await fixture.access.api.getRole(fixture.owner, { id: editor.id })).permissionIds,
  ).toEqual([grant.id]);
});

test('idempotent creates use normalized input and reject key reuse for another mutation', async () => {
  const fixture = await createFixture();
  const ctx = context(fixture.owner.token);
  const first = await fixture.access.api.createRole(ctx, { code: 'reviewer', name: ' Reviewer ' });
  const replay = await fixture.access.api.createRole(ctx, { name: 'Reviewer', code: 'reviewer' });
  expect(replay).toEqual(first);
  expect((await fixture.access.api.listRoles(fixture.owner, { q: 'reviewer' })).total).toBe(1);
  await expect(
    fixture.access.api.createRole(ctx, { code: 'another', name: 'Reviewer' }),
  ).rejects.toMatchObject({ code: 'idempotency_conflict' });
  await expect(
    fixture.access.api.createRole(
      { ...context(fixture.owner.token), idempotencyKey: '' },
      { code: 'missing_key', name: 'Missing' },
    ),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('invitation replay returns the original delivery current state and never redispatches', async () => {
  const fixture = await createFixture({ policy: { invitationCooldownMs: 1 } });
  const editor = await role(fixture, { code: 'editor' });
  const ctx = context(fixture.owner.token);
  const original = await fixture.access.api.createAdmin(ctx, {
    email: ' PENDING@EXAMPLE.TEST ',
    roleId: editor.id,
  });
  expect(original.admin).toMatchObject({
    email: 'pending@example.test',
    activation: 'pending',
    roleCode: 'editor',
  });
  await vi.waitFor(async () => {
    expect(
      (await fixture.access.api.getAdmin(fixture.owner, { id: original.admin.id }))
        .invitationDelivery?.status,
    ).toBe('accepted');
  });
  const resend = await fixture.access.api.inviteAdmin(context(fixture.owner.token), {
    id: original.admin.id,
  });
  expect(resend.delivery.id).not.toBe(original.delivery.id);
  const replay = await fixture.access.api.createAdmin(ctx, {
    email: 'pending@example.test',
    roleId: editor.id,
    displayName: null,
  });
  expect(replay.delivery).toEqual({ id: original.delivery.id, status: 'accepted' });
  await vi.waitFor(() => {
    expect(fixture.messages).toHaveLength(2);
  });
  const count = await fixture.database.query<{ count: string }>(
    'SELECT count(*) FROM admins WHERE email=$1',
    ['pending@example.test'],
  );
  expect(Number(count.rows[0]?.count)).toBe(1);
  await expect(
    fixture.identity.api.login(context(), { email: original.admin.email, password }),
  ).rejects.toMatchObject({ code: 'invalid_credentials' });
});

test('account role changes revoke sessions, archive is terminal and archived references protect roles', async () => {
  const fixture = await createFixture();
  const first = await role(fixture, { code: 'first' });
  const second = await role(fixture, { code: 'second' });
  const member = await invite(fixture, { email: 'member@example.test', roleId: first.id });
  const assigned = await fixture.access.api.updateAdmin(fixture.owner, {
    id: member.admin.id,
    version: member.admin.version,
    roleId: second.id,
  });
  await expect(fixture.access.api.me(member.ctx, {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
  const archived = await fixture.access.api.updateAdmin(fixture.owner, {
    id: assigned.id,
    version: assigned.version,
    status: 'archived',
  });
  await expect(
    fixture.access.api.updateAdmin(fixture.owner, {
      id: archived.id,
      version: archived.version,
      status: 'active',
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    fixture.access.api.deleteRole(fixture.owner, { id: second.id, version: 1 }),
  ).rejects.toMatchObject({ code: 'resource_in_use' });
  await expect(
    fixture.access.api.createAdmin(context(fixture.owner.token), {
      email: archived.email,
      roleId: first.id,
    }),
  ).rejects.toMatchObject({ code: 'identifier_taken' });
  expect(
    (await fixture.access.api.listAdmins(fixture.owner, { status: 'archived' })).rows.map(
      (admin) => admin.id,
    ),
  ).toEqual([member.admin.id]);
});

test('system super role and self status or assignment remain protected', async () => {
  const fixture = await createFixture();
  const superId = fixture.admin.roleId;
  expect(await fixture.access.api.getRole(fixture.owner, { id: superId })).toMatchObject({
    isSuper: true,
    permissionIds: [],
  });
  await expect(
    fixture.access.api.updateRole(fixture.owner, { id: superId, version: 1, name: 'Renamed' }),
  ).rejects.toMatchObject({ code: 'protected_resource' });
  await expect(
    fixture.access.api.deleteRole(fixture.owner, { id: superId, version: 1 }),
  ).rejects.toMatchObject({ code: 'protected_resource' });
  await expect(
    fixture.access.api.replaceRolePermissions(fixture.owner, {
      id: superId,
      version: 1,
      permissionIds: [],
    }),
  ).rejects.toMatchObject({ code: 'protected_resource' });
  for (const fields of [{ status: 'disabled' }, { roleId: superId }]) {
    await expect(
      fixture.access.api.updateAdmin(fixture.owner, {
        id: fixture.admin.id,
        version: 1,
        ...fields,
      }),
    ).rejects.toMatchObject({ code: 'protected_resource' });
  }
  const changed = await fixture.access.api.updateOwnProfile(fixture.owner, {
    version: 1,
    displayName: 'Owner',
  });
  expect(changed).toMatchObject({ version: 2, displayName: 'Owner' });
  await expect(
    fixture.access.api.updateOwnProfile(fixture.owner, {
      version: 2,
      displayName: 'Owner',
      roleId: superId,
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

test('authorized account and role lists paginate without losing total or leaking credentials', async () => {
  const fixture = await createFixture();
  const adminRead = await initialPermission(fixture, 'admins:read');
  const reviewer = await role(fixture, { code: 'reviewer', permissionIds: [adminRead.id] });
  const member = await invite(fixture, { email: 'reader@example.test', roleId: reviewer.id });
  const first = await fixture.access.api.listAdmins(member.ctx, {
    page: 1,
    pageSize: 1,
    sortBy: 'email',
    order: 'asc',
  });
  const second = await fixture.access.api.listAdmins(member.ctx, {
    page: 2,
    pageSize: 1,
    sortBy: 'email',
    order: 'asc',
  });
  expect(first.total).toBe(2);
  expect(second.total).toBe(2);
  expect(new Set([...first.rows, ...second.rows].map((item) => item.email))).toEqual(
    new Set(['owner@example.test', 'reader@example.test']),
  );
  expect(JSON.stringify(first)).not.toMatch(/password|token|hash|invitationDelivery/i);
  expect(await fixture.access.api.listAdmins(member.ctx, { page: 3, pageSize: 1 })).toMatchObject({
    rows: [],
    total: 2,
  });
  await expect(fixture.access.api.listRoles(member.ctx, {})).rejects.toMatchObject({
    code: 'forbidden',
  });
  await expect(fixture.access.api.listAdmins(context(), {})).rejects.toMatchObject({
    code: 'unauthenticated',
  });
});
