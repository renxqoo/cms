import { delegationPermits } from '@new-cms/cms/identity';
import type { CredentialGrant } from '@new-cms/cms/identity';
import type { SqlExecutor } from '@new-cms/database/client';
import { grantedPermissionIds } from './adapters/postgres/authorization-store.ts';
import { allResources } from './adapters/postgres/resource-store.ts';
import { bindingKey, operationScopes } from './endpoints.ts';
import type { AccessRuntime, Binding, Permission, Principal } from './types.ts';

function allowed(input: {
  actor: Principal;
  binding: Binding | undefined;
  permissions: Map<string, Permission>;
  grants: Set<string>;
  access: string;
}) {
  if (input.access === 'public') return false;
  if (input.access === 'authenticated') return true;
  if (input.actor.role.status !== 'active') return false;
  if (input.access === 'security') return input.actor.role.isSuper;
  if (!input.binding) return false;
  const permission = input.permissions.get(input.binding.permissionId);
  return (
    permission?.status === 'active' && (input.actor.role.isSuper || input.grants.has(permission.id))
  );
}

export async function effectiveOperations(
  runtime: AccessRuntime,
  tx: SqlExecutor,
  actor: Principal,
): Promise<CredentialGrant[]> {
  const bindings = new Map(
    (await allResources(tx, 'endpoint_bindings')).map((binding) => [bindingKey(binding), binding]),
  );
  const permissions = new Map(
    (await allResources(tx, 'permissions')).map((permission) => [permission.id, permission]),
  );
  const grants = await grantedPermissionIds(tx, actor.roleId);
  return [...runtime.operationMap.values()]
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .flatMap((operation) =>
      operationScopes(runtime, operation.scopeKind)
        .toSorted((a, b) => (a.collectionKey ?? '').localeCompare(b.collectionKey ?? ''))
        .filter(
          (scope) =>
            allowed({
              actor,
              binding: bindings.get(bindingKey({ operationId: operation.id, ...scope })),
              permissions,
              grants,
              access: operation.access,
            }) &&
            (!actor.delegation || delegationPermits(actor.delegation.grants, operation.id, scope)),
        )
        .map((scope) => ({ operationId: operation.id, ...scope })),
    );
}
