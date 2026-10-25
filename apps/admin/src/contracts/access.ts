import { z } from 'zod';
import { meSchema } from './auth';

const id = z.uuid();
const time = z.iso.datetime();
const status = z.enum(['active', 'disabled']);
const resource = {
  id,
  version: z.number().int().positive(),
  createdAt: time,
  updatedAt: time,
};
const scope = {
  scopeKind: z.enum(['global', 'collection']),
  collectionKey: z.string().nullable(),
};

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

const pageMetadata = {
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
};

export function pageSchema<T>(row: z.ZodType<T>): z.ZodType<Page<T>> {
  return z.object({ rows: z.array(row), ...pageMetadata });
}

export const adminSchema = meSchema.omit({ role: true });
export const deliverySummarySchema = z.object({
  id,
  status: z.enum(['pending', 'sending', 'accepted', 'failed', 'unknown']),
});
export const deliverySchema = deliverySummarySchema.extend({
  createdAt: time,
  finishedAt: time.nullable(),
});
export const adminDetailSchema = adminSchema.extend({
  invitationDelivery: deliverySchema.nullable(),
});
export const adminListSchema = pageSchema(adminSchema);
export const accountCreatedSchema = z.object({
  admin: adminSchema,
  delivery: deliverySummarySchema,
});
export const invitationCreatedSchema = z.object({
  adminId: id,
  delivery: deliverySummarySchema,
});
export const roleSchema = z.object({
  ...resource,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status,
  isSuper: z.boolean(),
});
export const roleDetailSchema = roleSchema.extend({ permissionIds: z.array(id) });
export const roleListItemSchema = roleSchema.extend({
  adminCount: z.number().int().nonnegative(),
  permissionCount: z.number().int().nonnegative(),
});
export const roleListSchema = pageSchema(roleListItemSchema);
export const permissionSchema = z.object({
  ...resource,
  ...scope,
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  status,
});
export const permissionListSchema = pageSchema(permissionSchema);
export const navigationNodeSchema = z.object({
  ...resource,
  parentId: id.nullable(),
  type: z.enum(['group', 'page', 'action']),
  name: z.string(),
  path: z.string().nullable(),
  icon: z.string().nullable(),
  sortOrder: z.number().int(),
  status,
  visibility: z.enum(['container', 'authenticated', 'permission']),
  permissionId: id.nullable(),
});

export type NavigationNode = z.infer<typeof navigationNodeSchema>;
export interface NavigationTree extends NavigationNode {
  children: NavigationTree[];
}

const navigationTreeSchema: z.ZodType<NavigationTree> = navigationNodeSchema.extend({
  children: z.lazy(() => z.array(navigationTreeSchema)),
});
export const navigationListSchema = z.object({ rows: z.array(navigationTreeSchema) });
export const bindingSchema = z.object({
  ...resource,
  ...scope,
  operationId: z.string(),
  permissionId: id,
});
export const endpointSchema = z.object({
  ...scope,
  operationId: z.string(),
  module: z.string(),
  method: z.string(),
  path: z.string(),
  accessKind: z.enum(['public', 'authenticated', 'permission', 'security']),
  bindingConfigurable: z.boolean(),
  binding: z.object({ id, permissionId: id, version: z.number().int().positive() }).nullable(),
});
export const endpointListSchema = pageSchema(endpointSchema);
export const auditSchema = z.object({
  id,
  actorKind: z.enum(['system', 'admin']),
  actorId: id.nullable(),
  operationId: z.string(),
  targetType: z.string(),
  targetId: z.string().nullable(),
  requestId: z.string(),
  detail: z.record(z.string(), z.unknown()),
  createdAt: time,
});
export const auditListSchema = pageSchema(auditSchema);

export type Admin = z.infer<typeof adminSchema>;
export type AdminDetail = z.infer<typeof adminDetailSchema>;
export type AccountCreated = z.infer<typeof accountCreatedSchema>;
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;
export type Delivery = z.infer<typeof deliverySchema>;
export type DeliverySummary = z.infer<typeof deliverySummarySchema>;
export type Role = z.infer<typeof roleSchema>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export type RoleListItem = z.infer<typeof roleListItemSchema>;
export type Permission = z.infer<typeof permissionSchema>;
export type Binding = z.infer<typeof bindingSchema>;
export type Endpoint = z.infer<typeof endpointSchema>;
export type Audit = z.infer<typeof auditSchema>;

export const recoveryEndpointListSchema = z.object({
  resource: z.literal('endpoints'),
  rows: z.array(endpointSchema),
  ...pageMetadata,
});
export const recoveryBindingListSchema = z.object({
  resource: z.literal('bindings'),
  rows: z.array(bindingSchema),
  ...pageMetadata,
});
export const recoveryPermissionListSchema = z.object({
  resource: z.literal('permissions'),
  rows: z.array(permissionSchema),
  ...pageMetadata,
});
export const recoveryReadSchema = z.discriminatedUnion('resource', [
  recoveryEndpointListSchema,
  recoveryBindingListSchema,
  recoveryPermissionListSchema,
]);
export type RecoveryRead = z.infer<typeof recoveryReadSchema>;
