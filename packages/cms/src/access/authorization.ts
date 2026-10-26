import type {
  RequestContext,
  Scope,
  OperationDefinition,
  ActorReference,
} from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { Account } from '@new-cms/cms/identity/composition';
import type { SqlExecutor } from '@new-cms/database/client';
import {
  bindingPermission,
  grantedPermissionIds,
} from './adapters/postgres/authorization-store.ts';
import { resource } from './adapters/postgres/resource-store.ts';
import type { AccessRuntime, Principal } from './types.ts';
import { requireScope } from './validation.ts';

export const globalScope: Scope = { scopeKind: 'global', collectionKey: null };

export function actorReference(actor: Principal): ActorReference {
  return { id: actor.id, delegationId: actor.delegation?.id ?? null };
}

function operationFor(runtime: AccessRuntime, operationId: string, scope: Scope) {
  const operation = runtime.operationMap.get(operationId);
  if (!operation) fail('not_found');
  requireScope(scope, runtime.collectionKeys);
  if (operation.scopeKind !== scope.scopeKind) fail('invalid_scope');
  return operation;
}

async function authorizeAccount(
  tx: SqlExecutor,
  input: { account: Account; operation: OperationDefinition; scope: Scope },
): Promise<Principal> {
  const { account, operation, scope } = input;
  const role = await resource(tx, { table: 'roles', id: account.roleId });
  const { invitationDelivery: _delivery, ...profile } = account;
  const actor = { ...profile, roleCode: role.code, role };
  if (operation.access === 'authenticated') return actor;
  if (role.status !== 'active') fail('forbidden');
  if (operation.access === 'security') {
    if (!role.isSuper || account.activation !== 'activated') fail('forbidden');
    return actor;
  }
  const binding = await bindingPermission(tx, { operationId: operation.id, scope });
  if (binding?.status !== 'active') fail('endpoint_unbound');
  if (!role.isSuper && !(await grantedPermissionIds(tx, role.id)).has(binding.permissionId))
    fail('forbidden');
  return actor;
}

export function createAuthorization(runtime: AccessRuntime) {
  return async function authorize(
    ...[tx, ctx, operationId, scope = globalScope]: [SqlExecutor, RequestContext, string, Scope?]
  ): Promise<Principal | null> {
    const operation = operationFor(runtime, operationId, scope);
    if (operation.access === 'public') return null;
    const authentication = await runtime.identity.delegations.authenticate(tx, ctx);
    const actor = await authorizeAccount(tx, { account: authentication.account, operation, scope });
    if (!authentication.delegation) return actor;
    await runtime.identity.delegations.authorize(tx, {
      id: authentication.delegation.id,
      adminId: actor.id,
      operationId,
      scope,
    });
    return {
      ...actor,
      delegation: {
        id: authentication.delegation.id,
        grants: await runtime.identity.delegations.authority(tx, {
          id: authentication.delegation.id,
          adminId: actor.id,
        }),
      },
    };
  };
}

export function createActorAuthorization(runtime: AccessRuntime) {
  return async function authorizeActor(
    tx: SqlExecutor,
    input: { actor: ActorReference; operationId: string; scope: Scope },
  ): Promise<Principal> {
    const operation = operationFor(runtime, input.operationId, input.scope);
    if (operation.access === 'public' || operation.access === 'authenticated') fail('forbidden');
    const account = await runtime.identity.account(tx, input.actor.id);
    if (account?.status !== 'active' || account.activation !== 'activated') fail('forbidden');
    const actor = await authorizeAccount(tx, { account, operation, scope: input.scope });
    if (input.actor.delegationId === null) return actor;
    await runtime.identity.delegations.authorize(tx, {
      id: input.actor.delegationId,
      adminId: account.id,
      operationId: input.operationId,
      scope: input.scope,
    });
    return {
      ...actor,
      delegation: {
        id: input.actor.delegationId,
        grants: await runtime.identity.delegations.authority(tx, {
          id: input.actor.delegationId,
          adminId: account.id,
        }),
      },
    };
  };
}

export type AccessAuthorization = ReturnType<typeof createAuthorization>;
export type AccessActorAuthorization = ReturnType<typeof createActorAuthorization>;
