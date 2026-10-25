import { randomUUID } from 'node:crypto';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import {
  allResources,
  changes,
  deleteResource,
  enforceCapacity,
  insertResource,
  resource,
  updateResource,
} from './adapters/postgres/resource-store.ts';
import { fullNavigationTree } from './navigation-tree.ts';
import { validateNavigation } from './navigation-rules.ts';
import { auditChange, createRunner, idempotent } from './runtime.ts';
import type { AccessRuntime } from './types.ts';
import { parse, requirePatch, requireVersion } from './validation.ts';

async function listNavigation(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'navigation.list', mode: 'shared' },
    async ({ tx }) => {
      parse(runtime.schemas['navigation.list'], input);
      return { rows: fullNavigationTree(await allResources(tx, 'navigation_nodes')) };
    },
  );
}

async function createNavigation(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'navigation.create', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['navigation.create'], input);
      return idempotent(
        state,
        { runtime, operationId: 'navigation.create', input: values },
        async () => {
          await enforceCapacity(state.tx, {
            table: 'navigation_nodes',
            maximum: runtime.policy.maxNavigationNodes,
          });
          const nodes = await allResources(state.tx, 'navigation_nodes');
          await validateNavigation(runtime, {
            node: { ...values, status: 'active' },
            nodes,
            tx: state.tx,
          });
          const node = await insertResource(state.tx, {
            table: 'navigation_nodes',
            values: { id: randomUUID(), ...values },
          });
          await auditChange(
            state,
            {
              operationId: 'navigation.create',
              targetType: 'navigation',
              targetId: node.id,
              detail: values,
            },
            runtime,
          );
          return node;
        },
      );
    },
  );
}

async function updateNavigation(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'navigation.update', mode: 'exclusive' },
    async (state) => {
      const values = parse(runtime.schemas['navigation.update'], input);
      requirePatch(values);
      const current = await resource(state.tx, { table: 'navigation_nodes', id: values.id });
      requireVersion(current, values.version);
      const changed = changes(current, values);
      if (Object.keys(changed).length === 0) return current;
      const merged = { ...current, ...changed };
      await validateNavigation(runtime, {
        node: merged,
        nodes: await allResources(state.tx, 'navigation_nodes'),
        tx: state.tx,
        id: current.id,
      });
      const node = await updateResource(state.tx, {
        table: 'navigation_nodes',
        id: current.id,
        version: current.version,
        values: changed,
      });
      await auditChange(
        state,
        {
          operationId: 'navigation.update',
          targetType: 'navigation',
          targetId: node.id,
          detail: changed,
        },
        runtime,
      );
      return node;
    },
  );
}

async function deleteNavigation(runtime: AccessRuntime, ctx: RequestContext, input: unknown) {
  return createRunner(runtime)(
    { ctx, operationId: 'navigation.delete', mode: 'exclusive' },
    async (state) => {
      const target = parse(runtime.schemas['navigation.delete'], input);
      const current = await resource(state.tx, { table: 'navigation_nodes', id: target.id });
      requireVersion(current, target.version);
      if (
        (await allResources(state.tx, 'navigation_nodes')).some(
          (node) => node.parentId === current.id,
        )
      )
        fail('resource_in_use');
      await deleteResource(state.tx, { table: 'navigation_nodes', id: target.id });
      await auditChange(
        state,
        {
          operationId: 'navigation.delete',
          targetType: 'navigation',
          targetId: target.id,
          detail: { name: current.name },
        },
        runtime,
      );
    },
  );
}

export function createNavigationApi(runtime: AccessRuntime) {
  return {
    listNavigation: (ctx: RequestContext, input: unknown) => listNavigation(runtime, ctx, input),
    createNavigation: (ctx: RequestContext, input: unknown) =>
      createNavigation(runtime, ctx, input),
    updateNavigation: (ctx: RequestContext, input: unknown) =>
      updateNavigation(runtime, ctx, input),
    deleteNavigation: (ctx: RequestContext, input: unknown) =>
      deleteNavigation(runtime, ctx, input),
  };
}
