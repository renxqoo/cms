import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
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
import type { AccessRuntime } from './types.ts';
import { parse, requirePatch, requireScope, requireVersion } from './validation.ts';

async function listPermissions(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'permissions.list', mode: 'shared' },
    async ({ tx }) => {
      const query = parse(runtime.schemas['permissions.list'], input);
      if (query.scopeKind === 'global' && query.collectionKey !== undefined)
        requireScope(
          { scopeKind: 'global', collectionKey: query.collectionKey },
          runtime.collectionKeys,
        );
      if (query.collectionKey !== undefined)
        requireScope(
          { scopeKind: 'collection', collectionKey: query.collectionKey },
          runtime.collectionKeys,
        );
      return listResources(tx, { table: 'permissions', ...query });
    },
  );
}

async function createPermission(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'permissions.create', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['permissions.create'], input);
      requireScope(values, runtime.collectionKeys);
      return idempotent(
        state,
        { runtime, operationId: 'permissions.create', input: values },
        async () => {
          await enforceCapacity(state.tx, {
            table: 'permissions',
            maximum: runtime.policy.maxPermissions,
          });
          const permission = await insertResource(state.tx, {
            table: 'permissions',
            values: { id: randomUUID(), ...values },
          });
          await auditChange(
            state,
            {
              operationId: 'permissions.create',
              targetType: 'permission',
              targetId: permission.id,
              detail: values,
            },
            runtime,
          );
          return permission;
        },
      );
    },
  );
}

async function updatePermission(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'permissions.update', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['permissions.update'], input);
      requirePatch(values);
      const current = await resource(state.tx, { table: 'permissions', id: values.id });
      requireVersion(current, values.version);
      const changed = changes(current, values);
      if (Object.keys(changed).length === 0) return current;
      const permission = await updateResource(state.tx, {
        table: 'permissions',
        id: values.id,
        version: values.version,
        values: changed,
      });
      await auditChange(
        state,
        {
          operationId: 'permissions.update',
          targetType: 'permission',
          targetId: permission.id,
          detail: changed,
        },
        runtime,
      );
      return permission;
    },
  );
}

async function deletePermission(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'permissions.delete', mode: 'exclusive' },
    async (state) => {
      const target = parse(runtime.schemas['permissions.delete'], input);
      const current = await resource(state.tx, { table: 'permissions', id: target.id });
      requireVersion(current, target.version);
      await deleteResource(state.tx, { table: 'permissions', id: target.id });
      await auditChange(
        state,
        {
          operationId: 'permissions.delete',
          targetType: 'permission',
          targetId: target.id,
          detail: { code: current.code },
        },
        runtime,
      );
    },
  );
}

export function createPermissionApi(runtime: AccessRuntime) {
  return {
    listPermissions: (ctx: RequestContext, input: unknown) => listPermissions(runtime, ctx, input),
    createPermission: (ctx: RequestContext, input: unknown) =>
      createPermission(runtime, ctx, input),
    updatePermission: (ctx: RequestContext, input: unknown) =>
      updatePermission(runtime, ctx, input),
    deletePermission: (ctx: RequestContext, input: unknown) =>
      deletePermission(runtime, ctx, input),
  };
}
