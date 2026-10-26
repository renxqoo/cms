import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { grantedPermissionIds } from './adapters/postgres/authorization-store.ts';
import { allResources } from './adapters/postgres/resource-store.ts';
import { adminProjection } from './admins.ts';
import { paginate } from './endpoints.ts';
import { visibleNavigationTree } from './navigation-tree.ts';
import { auditChange, createRunner } from './runtime.ts';
import type { AccessRuntime, NavigationNode, Permission, Principal } from './types.ts';
import { parse } from './validation.ts';
import { effectiveOperations } from './effective-operations.ts';
import { delegationPermits } from '@new-cms/cms/identity';

async function me(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)({ ctx, operationId: 'access.me', mode: 'shared' }, (state) => {
    parse(runtime.schemas['access.me'], input);
    const { role, delegation: _delegation, ...admin } = state.actor;
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
      const bindings = await allResources(state.tx, 'endpoint_bindings');
      const visible = new Set(
        nodes
          .filter(
            (node) =>
              visibleNode({ node, permissions, grants, actor: state.actor }, runtime) &&
              (!state.actor.delegation ||
                node.visibility !== 'permission' ||
                bindings.some(
                  (binding) =>
                    runtime.operationMap.has(binding.operationId) &&
                    binding.permissionId === node.permissionId &&
                    delegationPermits(
                      state.actor.delegation?.grants ?? [],
                      binding.operationId,
                      binding,
                    ),
                )),
          )
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
  if (
    input.node.type === 'page' &&
    (input.node.path === null || !runtime.navigationPaths.includes(input.node.path))
  )
    return false;
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

async function myOperations(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'access.myOperations', mode: 'shared' },
    async (state) => {
      const query = parse(runtime.schemas['access.myOperations'], input);
      const rows = await effectiveOperations(runtime, state.tx, state.actor);
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
