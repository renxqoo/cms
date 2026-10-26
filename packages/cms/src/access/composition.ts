import { requireRateLimit, rateLimitKey } from '@new-cms/cms/platform/rate-limits';
import type { RequestContext, Scope } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { createAuthorization, createActorAuthorization } from './authorization.ts';
import { createAdminApi } from './admins.ts';
import { createRoleApi } from './roles.ts';
import { createPermissionApi } from './permissions.ts';
import { createNavigationApi } from './navigation.ts';
import { createEndpointApi } from './endpoints.ts';
import { createSelfApi } from './self.ts';
import { createAuditApi } from './audit-query.ts';
import { createCatalog, operationRegistry } from './catalog.ts';
import { accessInputSchemas } from './input-schemas.ts';
import { createInitializer } from './initialize.ts';
import { createRecoveryApi } from './recovery/api.ts';
import type { AccessOptions, AccessRuntime, InitialCollectionPermission } from './types.ts';

export function createAccessCatalog(
  options: Pick<AccessOptions, 'database' | 'policy' | 'operations' | 'collectionKeys'> & {
    initialCollectionPermissions: readonly InitialCollectionPermission[];
  },
) {
  return createCatalog(
    { ...options, operationMap: operationRegistry(options.operations) },
    options.initialCollectionPermissions,
  );
}

function createCheck(runtime: AccessRuntime) {
  const authorize = createAuthorization(runtime);
  return function check(ctx: RequestContext, operationId: string, scope?: Scope) {
    return securityTransaction(runtime.database, runtime.policy, {
      mode: 'shared',
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      async work(tx) {
        const actor = await authorize(tx, ctx, operationId, scope);
        if (actor)
          await requireRateLimit(tx, {
            key: rateLimitKey(runtime.policy.rateLimitSecret, [
              'user-operation',
              actor.id,
              operationId,
            ]),
            limit: runtime.policy.userRateLimit,
            windowMs: runtime.policy.rateWindowMs,
          });
      },
    });
  };
}

export function createAccess(options: AccessOptions) {
  const runtime: AccessRuntime = {
    ...options,
    operationMap: operationRegistry(options.operations),
    schemas: accessInputSchemas(options.policy),
  };
  return {
    api: {
      ...createAdminApi(runtime),
      ...createRoleApi(runtime),
      ...createPermissionApi(runtime),
      ...createNavigationApi(runtime),
      ...createEndpointApi(runtime),
      ...createSelfApi(runtime),
      ...createAuditApi(runtime),
      ...createRecoveryApi(runtime),
    },
    authorize: createAuthorization(runtime),
    authorizeActor: createActorAuthorization(runtime),
    check: createCheck(runtime),
    ...createCatalog(runtime),
    initializeAdmin: createInitializer(runtime),
  };
}

export type AccessApi = ReturnType<typeof createAccess>['api'];
export type AccessCheck = ReturnType<typeof createAccess>['check'];
export type { AccessOptions } from './types.ts';
export type { InitialCollectionPermission } from './types.ts';

export type { AccessActorAuthorization } from './authorization.ts';
