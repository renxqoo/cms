import { z } from 'zod';
import { displayNameSchema, credentialInputSchemas } from '@new-cms/cms/identity';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { recoveryInputSchema } from './recovery/input.ts';
import {
  code,
  deleteSchema,
  description,
  emptySchema,
  id,
  listShape,
  name,
  permissionCode,
  scopeShape,
  status,
  targetSchema,
  version,
} from './validation.ts';

export const navigationFields = {
  parentId: id.nullable().default(null),
  type: z.enum(['group', 'page', 'action']),
  name,
  path: z.string().min(1).max(255).nullable().default(null),
  icon: z.string().max(64).nullable().default(null),
  sortOrder: z.number().int().min(-2147483648).max(2147483647).default(0),
  visibility: z.enum(['container', 'authenticated', 'permission']),
  permissionId: id.nullable().default(null),
};

const adminWrite = {
  'admins.get': targetSchema,
  'admins.create': z.strictObject({
    email: z.string().trim().toLowerCase().max(255),
    displayName: displayNameSchema.default(null),
    roleId: id,
  }),
  'admins.update': z.strictObject({
    id,
    version,
    displayName: displayNameSchema.optional(),
    roleId: id.optional(),
    status: z.enum(['active', 'disabled', 'archived']).optional(),
  }),
  'admins.invite': targetSchema,
};

const roleWrite = {
  'roles.get': targetSchema,
  'roles.update': z.strictObject({
    id,
    version,
    name: name.optional(),
    description: description.optional(),
    status: status.optional(),
  }),
  'roles.delete': deleteSchema,
};

const permissionWrite = {
  'permissions.create': z.strictObject({
    code: permissionCode,
    name,
    description: description.default(null),
    ...scopeShape,
  }),
  'permissions.update': z.strictObject({
    id,
    version,
    name: name.optional(),
    description: description.optional(),
    status: status.optional(),
  }),
  'permissions.delete': deleteSchema,
};

const navigationWrite = {
  'navigation.list': emptySchema,
  'navigation.create': z.strictObject(navigationFields),
  'navigation.update': z.strictObject({
    id,
    version,
    parentId: id.nullable().optional(),
    type: z.enum(['group', 'page', 'action']).optional(),
    name: name.optional(),
    path: z.string().min(1).max(255).nullable().optional(),
    icon: z.string().max(64).nullable().optional(),
    sortOrder: z.number().int().min(-2147483648).max(2147483647).optional(),
    visibility: z.enum(['container', 'authenticated', 'permission']).optional(),
    permissionId: id.nullable().optional(),
    status: status.optional(),
  }),
  'navigation.delete': deleteSchema,
};

const bindingWrite = {
  'endpoints.createBinding': z.strictObject({
    operationId: z.string().min(1).max(128),
    ...scopeShape,
    permissionId: id,
  }),
  'endpoints.updateBinding': z.strictObject({ id, version, permissionId: id }),
  'endpoints.deleteBinding': deleteSchema,
};

const selfWrite = {
  'access.me': emptySchema,
  'access.updateOwnProfile': z.strictObject({
    version,
    displayName: displayNameSchema,
  }),
  'access.myNavigation': emptySchema,
};

function lists(policy: CmsPolicy) {
  const list = listShape(policy);
  return {
    'admins.list': z.strictObject({
      ...list,
      sortBy: z.enum(['createdAt', 'email', 'displayName', 'lastLoginAt']).default('createdAt'),
      status: z.enum(['active', 'disabled', 'archived']).optional(),
      activation: z.enum(['pending', 'activated']).optional(),
    }),
    'roles.list': z.strictObject({
      ...list,
      sortBy: z.enum(['createdAt', 'code', 'name']).default('createdAt'),
    }),
    'permissions.list': z.strictObject({
      ...list,
      sortBy: z.enum(['createdAt', 'code', 'name']).default('createdAt'),
      status: status.optional(),
      scopeKind: scopeShape.scopeKind.optional(),
      collectionKey: z
        .string()
        .regex(/^[a-z][a-z0-9_-]{0,63}$/)
        .optional(),
    }),
    'endpoints.list': z.strictObject({
      page: list.page,
      pageSize: list.pageSize,
      module: z.string().max(32).optional(),
      accessKind: z.enum(['public', 'authenticated', 'security', 'permission']).optional(),
    }),
    'access.myOperations': z.strictObject({ page: list.page, pageSize: list.pageSize }),
    'audit.list': z.strictObject({
      ...list,
      sortBy: z.literal('createdAt').default('createdAt'),
      actorId: id.optional(),
      operationId: z.string().max(128).optional(),
      targetType: z.string().max(64).optional(),
      targetId: z.string().max(160).optional(),
      from: z.iso.datetime().optional(),
      to: z.iso.datetime().optional(),
    }),
  };
}

export function accessInputSchemas(policy: CmsPolicy) {
  const permissionIds = z.array(id).max(policy.maxRolePermissions);
  return {
    ...adminWrite,
    ...roleWrite,
    ...permissionWrite,
    ...navigationWrite,
    ...bindingWrite,
    ...selfWrite,
    ...credentialInputSchemas(policy),
    ...lists(policy),
    'access.readRecovery': recoveryInputSchema(policy),
    'roles.create': z.strictObject({
      code,
      name,
      description: description.default(null),
      permissionIds: permissionIds.default([]),
    }),
    'roles.replacePermissions': z.strictObject({ id, version, permissionIds }),
  };
}
