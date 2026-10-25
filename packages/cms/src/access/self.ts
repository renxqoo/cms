import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { grantedPermissionIds } from './adapters/postgres/authorization-store.ts';
import { allResources } from './adapters/postgres/resource-store.ts';
import { adminProjection } from './admins.ts';
import { bindingKey, operationScopes, paginate } from './endpoints.ts';
import { visibleNavigationTree } from './navigation-tree.ts';
import { auditChange, createRunner } from './runtime.ts';
import type { AccessRuntime, Binding, NavigationNode, Permission, Principal } from './types.ts';
import { parse } from './validation.ts';

async function me(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)({ ctx, operationId: 'access.me', mode: 'shared' }, (state) => {
    parse(runtime.schemas['access.me'], input);
    const { role, ...admin } = state.actor;
    return Promise.resolve({
      ...admin,
      role: {
        id: role.id,
        code: role.code,
        name: role.name,
        status: role.status,
        isSuper: role.isSuper,
      },
    });
  });
}

async function updateOwnProfile(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'access.updateOwnProfile', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['access.updateOwnProfile'], input);
      const account = await runtime.identity.updateAccount(state.tx, {
        ...values,
        id: state.actor.id,
      });
      if (account.version !== state.actor.version)
        await auditChange(
          state,
          {
            operationId: 'access.updateOwnProfile',
            targetType: 'admin',
            targetId: account.id,
            detail: { displayName: account.displayName },
          },
          runtime,
        );
      return adminProjection(account, state.actor.role);
    },
  );
}

async function myNavigation(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'access.myNavigation', mode: 'shared' },
    async (state) => {
      parse(runtime.schemas['access.myNavigation'], input);
      const nodes = await allResources(state.tx, 'navigation_nodes');
      const permissions = new Map(
        (await allResources(state.tx, 'permissions')).map((permission) => [
          permission.id,
          permission,
        ]),
      );
      const grants = await grantedPermissionIds(state.tx, state.actor.roleId);
      const visible = new Set(
        nodes
          .filter((node) => visibleNode({ node, permissions, grants, actor: state.actor }, runtime))
          .map((node) => node.id),
      );
      return { rows: visibleNavigationTree(nodes, visible) };
    },
  );
}

function visibleNode(
  input: {
    node: NavigationNode;
    permissions: Map<string, Permission>;
    grants: Set<string>;
    actor: Principal;
  },
  runtime: AccessRuntime,
) {
  if (input.node.visibility !== 'permission') return true;
  const permission = input.permissions.get(input.node.permissionId ?? '');
  if (permission?.status !== 'active' || input.actor.role.status !== 'active') return false;
  if (
    permission.scopeKind === 'collection' &&
    !runtime.collectionKeys.includes(permission.collectionKey ?? '')
  )
    return false;
  return input.actor.role.isSuper || input.grants.has(permission.id);
}

function allowedOperation(input: {
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

async function myOperations(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'access.myOperations', mode: 'shared' },
    async (state) => {
      const query = parse(runtime.schemas['access.myOperations'], input);
      const bindings = new Map(
        (await allResources(state.tx, 'endpoint_bindings')).map((binding) => [
          bindingKey(binding),
          binding,
        ]),
      );
      const permissions = new Map(
        (await allResources(state.tx, 'permissions')).map((permission) => [
          permission.id,
          permission,
        ]),
      );
      const grants = await grantedPermissionIds(state.tx, state.actor.roleId);
      const rows = [...runtime.operationMap.values()]
        .toSorted((a, b) => a.id.localeCompare(b.id))
        .flatMap((operation) =>
          operationScopes(runtime, operation.scopeKind)
            .toSorted((a, b) => (a.collectionKey ?? '').localeCompare(b.collectionKey ?? ''))
            .filter((scope) => {
              const binding = bindings.get(bindingKey({ operationId: operation.id, ...scope }));
              return allowedOperation({
                actor: state.actor,
                binding,
                permissions,
                grants,
                access: operation.access,
              });
            })
            .map((scope) => ({ operationId: operation.id, ...scope })),
        );
      return paginate(rows, query);
    },
  );
}

export function createSelfApi(runtime: AccessRuntime) {
  return {
    me: (ctx: RequestContext, input: unknown) => me(runtime, ctx, input),
    updateOwnProfile: (ctx: RequestContext, input: unknown) =>
      updateOwnProfile(runtime, ctx, input),
    myNavigation: (ctx: RequestContext, input: unknown) => myNavigation(runtime, ctx, input),
    myOperations: (ctx: RequestContext, input: unknown) => myOperations(runtime, ctx, input),
  };
}
