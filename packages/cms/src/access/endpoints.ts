import { randomUUID } from 'node:crypto';
import type { RequestContext, Scope } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import {
  allResources,
  deleteResource,
  insertResource,
  resource,
  updateResource,
} from './adapters/postgres/resource-store.ts';
import { auditChange, createRunner, idempotent } from './runtime.ts';
import type { AccessRuntime } from './types.ts';
import { parse, requireScope, requireVersion } from './validation.ts';

export function bindingKey(input: {
  operationId: string;
  scopeKind: string;
  collectionKey: string | null;
}) {
  return JSON.stringify([input.operationId, input.scopeKind, input.collectionKey]);
}

export function operationScopes(runtime: AccessRuntime, scopeKind: Scope['scopeKind']): Scope[] {
  return scopeKind === 'global'
    ? [{ scopeKind, collectionKey: null }]
    : runtime.collectionKeys.map((collectionKey) => ({ scopeKind, collectionKey }));
}

export function paginate<T>(rows: T[], input: { page: number; pageSize: number }) {
  const start = (input.page - 1) * input.pageSize;
  if (!Number.isSafeInteger(start)) fail('invalid_input');
  return {
    rows: rows.slice(start, start + input.pageSize),
    total: rows.length,
    page: input.page,
    pageSize: input.pageSize,
  };
}

async function validateBinding(
  runtime: AccessRuntime,
  tx: SqlExecutor,
  input: {
    operationId: string;
    scopeKind: Scope['scopeKind'];
    collectionKey: string | null;
    permissionId: string;
  },
) {
  requireScope(input, runtime.collectionKeys);
  const operation = runtime.operationMap.get(input.operationId);
  if (operation?.access !== 'permission' || !operation.bindingConfigurable) fail('invalid_input');
  if (operation.scopeKind !== input.scopeKind) fail('scope_mismatch');
  const permission = await resource(tx, { table: 'permissions', id: input.permissionId });
  if (permission.scopeKind !== input.scopeKind || permission.collectionKey !== input.collectionKey)
    fail('scope_mismatch');
  if (permission.status !== 'active') fail('invalid_input');
}

async function listEndpoints(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'endpoints.list', mode: 'shared' },
    async ({ tx }) => {
      const query = parse(runtime.schemas['endpoints.list'], input);
      const bindings = new Map(
        (await allResources(tx, 'endpoint_bindings')).map((binding) => [
          bindingKey(binding),
          binding,
        ]),
      );
      const operations = [...runtime.operationMap.values()]
        .filter(
          (operation) =>
            (!query.module || operation.module === query.module) &&
            (!query.accessKind || operation.access === query.accessKind),
        )
        .toSorted((a, b) => a.id.localeCompare(b.id));
      const rows = operations.flatMap((operation) =>
        operationScopes(runtime, operation.scopeKind)
          .toSorted((a, b) => (a.collectionKey ?? '').localeCompare(b.collectionKey ?? ''))
          .map((scope) => {
            const binding = bindings.get(bindingKey({ operationId: operation.id, ...scope }));
            return {
              operationId: operation.id,
              module: operation.module,
              method: operation.method,
              path: operation.path,
              accessKind: operation.access,
              bindingConfigurable: operation.bindingConfigurable,
              ...scope,
              binding: binding
                ? { id: binding.id, permissionId: binding.permissionId, version: binding.version }
                : null,
            };
          }),
      );
      return paginate(rows, query);
    },
  );
}

async function createBinding(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'endpoints.createBinding', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['endpoints.createBinding'], input);
      return idempotent(
        state,
        { runtime, operationId: 'endpoints.createBinding', input: values },
        async () => {
          await validateBinding(runtime, state.tx, values);
          const existing = await allResources(state.tx, 'endpoint_bindings');
          if (existing.some((binding) => bindingKey(binding) === bindingKey(values)))
            fail('binding_exists');
          const binding = await insertResource(state.tx, {
            table: 'endpoint_bindings',
            values: { id: randomUUID(), ...values },
          });
          await auditChange(
            state,
            {
              operationId: 'endpoints.createBinding',
              targetType: 'binding',
              targetId: binding.id,
              detail: values,
            },
            runtime,
          );
          return binding;
        },
      );
    },
  );
}

async function updateBinding(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'endpoints.updateBinding', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['endpoints.updateBinding'], input);
      const current = await resource(state.tx, { table: 'endpoint_bindings', id: values.id });
      requireVersion(current, values.version);
      await validateBinding(runtime, state.tx, { ...current, permissionId: values.permissionId });
      if (current.permissionId === values.permissionId) return current;
      const binding = await updateResource(state.tx, {
        table: 'endpoint_bindings',
        id: current.id,
        version: current.version,
        values: { permissionId: values.permissionId },
      });
      await auditChange(
        state,
        {
          operationId: 'endpoints.updateBinding',
          targetType: 'binding',
          targetId: binding.id,
          detail: { permissionId: values.permissionId },
        },
        runtime,
      );
      return binding;
    },
  );
}

async function deleteBinding(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'endpoints.deleteBinding', mode: 'exclusive' },
    async (state) => {
      const target = parse(runtime.schemas['endpoints.deleteBinding'], input);
      const current = await resource(state.tx, { table: 'endpoint_bindings', id: target.id });
      requireVersion(current, target.version);
      await deleteResource(state.tx, { table: 'endpoint_bindings', id: target.id });
      await auditChange(
        state,
        {
          operationId: 'endpoints.deleteBinding',
          targetType: 'binding',
          targetId: target.id,
          detail: { operationId: current.operationId },
        },
        runtime,
      );
    },
  );
}

export function createEndpointApi(runtime: AccessRuntime) {
  return {
    listEndpoints: (ctx: RequestContext, input: unknown) => listEndpoints(runtime, ctx, input),
    createBinding: (ctx: RequestContext, input: unknown) => createBinding(runtime, ctx, input),
    updateBinding: (ctx: RequestContext, input: unknown) => updateBinding(runtime, ctx, input),
    deleteBinding: (ctx: RequestContext, input: unknown) => deleteBinding(runtime, ctx, input),
  };
}
