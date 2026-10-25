import type { RequestContext, Scope, OperationDefinition } from '@new-cms/cms/platform/contracts';
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
    const account = await runtime.identity.authenticate(tx, ctx);
    return authorizeAccount(tx, { account, operation, scope });
  };
}

export function createActorAuthorization(runtime: AccessRuntime) {
  return async function authorizeActor(
    tx: SqlExecutor,
    input: { actorId: string; operationId: string; scope: Scope },
  ): Promise<Principal> {
    const operation = operationFor(runtime, input.operationId, input.scope);
    if (operation.access === 'public' || operation.access === 'authenticated') fail('forbidden');
    const account = await runtime.identity.account(tx, input.actorId);
    if (account?.status !== 'active' || account.activation !== 'activated') fail('forbidden');
    return authorizeAccount(tx, { account, operation, scope: input.scope });
  };
}

export type AccessAuthorization = ReturnType<typeof createAuthorization>;
export type AccessActorAuthorization = ReturnType<typeof createActorAuthorization>;
