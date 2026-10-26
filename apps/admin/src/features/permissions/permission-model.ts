import { z } from 'zod';
import type { Endpoint, Permission } from '../../contracts/access';
import type { Collection } from '../../contracts/content';

export function permissionCollections(input: {
  endpoints: readonly Endpoint[] | null;
  collections: readonly Pick<Collection, 'key' | 'label'>[] | null;
}): Pick<Collection, 'key' | 'label'>[] | null {
  const choices = new Map(input.collections?.map((collection) => [collection.key, collection]));
  for (const endpoint of input.endpoints ?? []) {
    const key = endpoint.collectionKey;
    if (
      endpoint.operationId === 'collections.get' &&
      endpoint.scopeKind === 'collection' &&
      key !== null &&
      !choices.has(key)
    )
      choices.set(key, { key, label: key });
  }
  return input.collections === null && choices.size === 0 ? null : [...choices.values()];
}

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
