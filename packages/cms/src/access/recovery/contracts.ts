import { z } from 'zod';

const scope = {
  scopeKind: z.enum(['global', 'collection']),
  collectionKey: z.string().nullable(),
};
const resource = {
  id: z.uuid(),
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};

export const recoveryEndpointSchema = z.strictObject({
  operationId: z.string(),
  module: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
  accessKind: z.enum(['public', 'authenticated', 'security', 'permission']),
  bindingConfigurable: z.boolean(),
  ...scope,
  binding: z
    .strictObject({
      id: z.uuid(),
      permissionId: z.uuid(),
      version: z.number().int().positive(),
    })
    .nullable(),
});

export const recoveryBindingSchema = z.strictObject({
  ...resource,
  operationId: z.string(),
  permissionId: z.uuid(),
  ...scope,
});

export const recoveryPermissionSchema = z.strictObject({
  ...resource,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(['active', 'disabled']),
  ...scope,
});

const pagination = {
  total: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  page: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  pageSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
};

export const recoveryPageSchema = z.discriminatedUnion('resource', [
  z.strictObject({
    resource: z.literal('endpoints'),
    rows: z.array(recoveryEndpointSchema),
    ...pagination,
  }),
  z.strictObject({
    resource: z.literal('bindings'),
    rows: z.array(recoveryBindingSchema),
    ...pagination,
  }),
  z.strictObject({
    resource: z.literal('permissions'),
    rows: z.array(recoveryPermissionSchema),
    ...pagination,
  }),
]);

export type RecoveryEndpoint = z.infer<typeof recoveryEndpointSchema>;
export type RecoveryBinding = z.infer<typeof recoveryBindingSchema>;
export type RecoveryPermission = z.infer<typeof recoveryPermissionSchema>;
export type RecoveryPage = z.infer<typeof recoveryPageSchema>;
