import { z } from 'zod';
import type { Endpoint, Permission } from '../../contracts/access';

export const permissionValuesSchema = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().max(512).nullable(),
  status: z.enum(['active', 'disabled']),
});

export const createPermissionSchema = permissionValuesSchema
  .omit({ status: true })
  .extend({
    code: z
      .string()
      .max(160)
      .regex(/^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*){1,3}$/),
    scopeKind: z.enum(['global', 'collection']),
    collectionKey: z.string().nullable(),
  })
  .refine(
    (value) =>
      value.scopeKind === 'global' ? value.collectionKey === null : Boolean(value.collectionKey),
    { path: ['collectionKey'] },
  );

export function eligiblePermissions(
  endpoint: Endpoint,
  permissions: readonly Permission[],
): Permission[] {
  return permissions.filter(
    (permission) =>
      permission.status === 'active' &&
      permission.scopeKind === endpoint.scopeKind &&
      permission.collectionKey === endpoint.collectionKey,
  );
}

export function permissionChanges(
  before: Permission,
  after: z.infer<typeof permissionValuesSchema>,
) {
  return {
    ...(before.name === after.name ? {} : { name: after.name }),
    ...(before.description === after.description ? {} : { description: after.description }),
    ...(before.status === after.status ? {} : { status: after.status }),
  };
}
