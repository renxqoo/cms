import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import {
  permissionIds,
  replacePermissions,
  requireActivePermissions,
  roleCounts,
} from './adapters/postgres/authorization-store.ts';
import {
  changes,
  deleteResource,
  enforceCapacity,
  insertResource,
  listResources,
  resource,
  updateResource,
} from './adapters/postgres/resource-store.ts';
import { auditChange, createRunner, idempotent } from './runtime.ts';
import type { AccessRuntime, Role, RoleDetail } from './types.ts';
import { parse, requirePatch, requireVersion } from './validation.ts';

async function detail(tx: SqlExecutor, role: Role): Promise<RoleDetail> {
  return { ...role, permissionIds: role.isSuper ? [] : await permissionIds(tx, role.id) };
}

function editable(role: Role) {
  if (role.isSuper) fail('protected_resource');
}

async function validateGrants(tx: SqlExecutor, ids: string[]) {
  if (new Set(ids).size !== ids.length || !(await requireActivePermissions(tx, ids)))
    fail('invalid_input');
}

async function listRoles(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'roles.list', mode: 'shared' },
    async ({ tx }) => {
      const query = parse(runtime.schemas['roles.list'], input);
      const page = await listResources(tx, { table: 'roles', ...query });
      const rows = await Promise.all(
        page.rows.map(async (role) => ({ ...role, ...(await roleCounts(tx, role.id)) })),
      );
      return { ...page, rows };
    },
  );
}

async function getRole(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'roles.get', mode: 'shared' },
    async ({ tx }) => {
      const target = parse(runtime.schemas['roles.get'], input);
      return detail(tx, await resource(tx, { table: 'roles', ...target }));
    },
  );
}

async function createRole(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'roles.create', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['roles.create'], input);
      if (values.code === 'super_admin') fail('protected_resource');
      return idempotent(
        state,
        { runtime, operationId: 'roles.create', input: values },
        async () => {
          await enforceCapacity(state.tx, { table: 'roles', maximum: runtime.policy.maxRoles });
          await validateGrants(state.tx, values.permissionIds);
          const { permissionIds: grants, ...fields } = values;
          const role = await insertResource(state.tx, {
            table: 'roles',
            values: { id: randomUUID(), ...fields },
          });
          await replacePermissions(state.tx, { roleId: role.id, permissionIds: grants });
          await auditChange(
            state,
            {
              operationId: 'roles.create',
              targetType: 'role',
              targetId: role.id,
              detail: { code: role.code, added: grants, removed: [] },
            },
            runtime,
          );
          return detail(state.tx, role);
        },
      );
    },
  );
}

async function updateRole(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'roles.update', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['roles.update'], input);
      requirePatch(values);
      const current = await resource(state.tx, { table: 'roles', id: values.id });
      editable(current);
      requireVersion(current, values.version);
      const changed = changes(current, values);
      if (Object.keys(changed).length === 0) return current;
      const role = await updateResource(state.tx, {
        table: 'roles',
        id: values.id,
        version: values.version,
        values: changed,
      });
      await auditChange(
        state,
        { operationId: 'roles.update', targetType: 'role', targetId: role.id, detail: changed },
        runtime,
      );
      return role;
    },
  );
}

async function replaceRolePermissions(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'roles.replacePermissions', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['roles.replacePermissions'], input);
      const current = await resource(state.tx, { table: 'roles', id: values.id });
      editable(current);
      requireVersion(current, values.version);
      await validateGrants(state.tx, values.permissionIds);
      const before = await permissionIds(state.tx, current.id);
      const added = values.permissionIds.filter((permissionId) => !before.includes(permissionId));
      const removed = before.filter((permissionId) => !values.permissionIds.includes(permissionId));
      if (added.length === 0 && removed.length === 0) return detail(state.tx, current);
      await replacePermissions(state.tx, {
        roleId: current.id,
        permissionIds: values.permissionIds,
      });
      const role = await updateResource(state.tx, {
        table: 'roles',
        id: current.id,
        version: current.version,
        values: { name: current.name },
      });
      await auditChange(
        state,
        {
          operationId: 'roles.replacePermissions',
          targetType: 'role',
          targetId: role.id,
          detail: { added, removed, addedCount: added.length, removedCount: removed.length },
        },
        runtime,
      );
      return detail(state.tx, role);
    },
  );
}

async function deleteRole(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'roles.delete', mode: 'exclusive' },
    async (state) => {
      const target = parse(runtime.schemas['roles.delete'], input);
      const current = await resource(state.tx, { table: 'roles', id: target.id });
      editable(current);
      requireVersion(current, target.version);
      if ((await roleCounts(state.tx, target.id)).adminCount > 0) fail('resource_in_use');
      await deleteResource(state.tx, { table: 'roles', id: target.id });
      await auditChange(
        state,
        {
          operationId: 'roles.delete',
          targetType: 'role',
          targetId: target.id,
          detail: { code: current.code },
        },
        runtime,
      );
    },
  );
}

export function createRoleApi(runtime: AccessRuntime) {
  return {
    listRoles: (ctx: RequestContext, input: unknown) => listRoles(runtime, ctx, input),
    getRole: (ctx: RequestContext, input: unknown) => getRole(runtime, ctx, input),
    createRole: (ctx: RequestContext, input: unknown) => createRole(runtime, ctx, input),
    updateRole: (ctx: RequestContext, input: unknown) => updateRole(runtime, ctx, input),
    replaceRolePermissions: (ctx: RequestContext, input: unknown) =>
      replaceRolePermissions(runtime, ctx, input),
    deleteRole: (ctx: RequestContext, input: unknown) => deleteRole(runtime, ctx, input),
  };
}
