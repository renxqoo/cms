import { expect, it } from 'vitest';
import {
  adminSchema,
  adminDetailSchema,
  accountCreatedSchema,
  invitationCreatedSchema,
  roleDetailSchema,
  roleListSchema,
  navigationListSchema,
  endpointSchema,
  auditSchema,
  recoveryReadSchema,
  recoveryPermissionListSchema,
} from '../access';

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};
const admin = {
  ...base,
  email: 'owner@example.test',
  displayName: null,
  roleId: '22222222-2222-4222-8222-222222222222',
  roleCode: 'reader',
  status: 'active',
  activation: 'pending',
  lastLoginAt: null,
};

it('projects safe account fields and strips credentials, bearer values and unrelated role objects', () => {
  const value = adminSchema.parse({
    ...admin,
    passwordHash: 'private hash',
    token: 'private bearer',
    role: { hidden: true },
  });
  expect(value).not.toHaveProperty('passwordHash');
  expect(value).not.toHaveProperty('token');
  expect(value).not.toHaveProperty('role');
  expect(value.displayName).toBeNull();
});

it('distinguishes an invitation delivery acceptance from an invented delivered state', () => {
  expect(
    accountCreatedSchema.safeParse({ admin, delivery: { id: base.id, status: 'delivered' } })
      .success,
  ).toBe(false);
  expect(
    invitationCreatedSchema.safeParse({
      adminId: base.id,
      delivery: { id: base.id, status: 'accepted' },
    }).success,
  ).toBe(true);
  expect(
    adminDetailSchema.safeParse({
      ...admin,
      invitationDelivery: {
        id: base.id,
        status: 'unknown',
        createdAt: base.createdAt,
        finishedAt: null,
      },
    }).success,
  ).toBe(true);
});

it('rejects malformed account versions and unrecognized lifecycle states', () => {
  expect(adminSchema.safeParse({ ...admin, version: 0 }).success).toBe(false);
  expect(adminSchema.safeParse({ ...admin, status: 'deleted' }).success).toBe(false);
  expect(adminSchema.safeParse({ ...admin, activation: 'invited' }).success).toBe(false);
});

it('requires an explicit complete permission list in role detail and valid pagination metadata', () => {
  const role = {
    ...base,
    code: 'editor',
    name: 'Editor',
    description: null,
    status: 'active',
    isSuper: false,
  };
  expect(roleDetailSchema.safeParse(role).success).toBe(false);
  expect(roleDetailSchema.safeParse({ ...role, permissionIds: [base.id] }).success).toBe(true);
  expect(
    roleListSchema.safeParse({
      rows: [{ ...role, adminCount: 2, permissionCount: 1 }],
      total: 1,
      page: 0,
      pageSize: 100,
    }).success,
  ).toBe(false);
  expect(
    roleListSchema.safeParse({
      rows: [{ ...role, adminCount: -1, permissionCount: 1 }],
      total: 1,
      page: 1,
      pageSize: 100,
    }).success,
  ).toBe(false);
});

it('validates every descendant instead of silently accepting a malformed navigation child', () => {
  const group = {
    ...base,
    parentId: null,
    type: 'group',
    name: 'Group',
    path: null,
    icon: null,
    sortOrder: 0,
    status: 'active',
    visibility: 'container',
    permissionId: null,
    children: [],
  };
  expect(
    navigationListSchema.safeParse({
      rows: [{ ...group, children: [{ ...group, version: null }] }],
    }).success,
  ).toBe(false);
  expect(navigationListSchema.safeParse({ rows: [group] }).success).toBe(true);
});

it('rejects a malformed binding version while retaining arbitrary safe audit detail data', () => {
  const endpoint = {
    operationId: 'roles.list',
    module: 'access',
    method: 'GET',
    path: '/v1/roles',
    accessKind: 'permission',
    scopeKind: 'global',
    collectionKey: null,
    bindingConfigurable: true,
    binding: { id: base.id, permissionId: base.id, version: 0 },
  };
  expect(endpointSchema.safeParse(endpoint).success).toBe(false);
  expect(endpointSchema.safeParse({ ...endpoint, binding: null }).success).toBe(true);
  expect(
    auditSchema.parse({
      id: base.id,
      actorKind: 'system',
      actorId: null,
      operationId: 'roles.update',
      targetType: 'role',
      targetId: null,
      requestId: 'request-id',
      detail: { changed: ['name'], before: { name: 'Before' } },
      createdAt: base.createdAt,
    }).detail,
  ).toEqual({ changed: ['name'], before: { name: 'Before' } });
});

it('rejects a recovery response for the wrong requested resource and validates its row projection', () => {
  const permission = {
    ...base,
    code: 'access.read',
    name: 'Read',
    description: null,
    status: 'disabled',
    scopeKind: 'collection',
    collectionKey: 'retired_collection',
  };
  const page = { resource: 'permissions', rows: [permission], total: 1, page: 1, pageSize: 100 };
  expect(recoveryReadSchema.safeParse(page).success).toBe(true);
  expect(recoveryPermissionListSchema.safeParse({ ...page, resource: 'bindings' }).success).toBe(
    false,
  );
  expect(recoveryReadSchema.safeParse({ ...page, resource: 'endpoints' }).success).toBe(false);
});
