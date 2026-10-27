import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  authorizeStateOperation,
  collectionPredicate,
  createRunner,
  parse,
} from '../runtime.ts';
import { visibleDocuments } from './visible-documents.ts';
import { reorderDocuments } from '../adapters/postgres/order-store.ts';
import { readOrderState } from '../adapters/postgres/order-state.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

async function operationState(
  state: ContentState,
  runtime: ContentRuntime,
  operationId: string,
): Promise<ContentState> {
  const actor = await authorizeStateOperation(state, {
    runtime,
    operationId,
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  const { predicate: _predicate, ...base } = state;
  const next = { ...base, actor, operationId };
  const predicate = await collectionPredicate(next);
  return { ...next, ...(predicate ? { predicate } : {}) };
}

async function requireVisible(
  state: ContentState,
  runtime: ContentRuntime,
  ids: readonly string[],
) {
  const visible = await visibleDocuments(state, { runtime, ids, trashed: false });
  if (ids.some((id) => !visible.has(id))) fail('not_found');
}

function getOrder(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.order'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.order',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      if (!state.collection.orderable || state.predicate) fail('invalid_input');
      await operationState(state, runtime, 'documents.list');
      const order = await readOrderState(state.tx, {
        collection: state.collection.id,
        scopeKey: '',
      });
      if (!order) fail('temporarily_unavailable');
      return { version: order.version };
    },
  );
}

function reorder(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.reorder'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.reorder',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      if (!state.collection.orderable) fail('invalid_input');
      const reader = await operationState(state, runtime, 'documents.list');
      const writer = await operationState(state, runtime, 'documents.update');
      await runtime.store.lockDocuments(state.tx, {
        ids: [...input.ids, input.targetId].toSorted(),
      });
      await requireVisible(reader, runtime, [...input.ids, input.targetId]);
      await requireVisible(state, runtime, input.ids);
      await requireVisible(writer, runtime, input.ids);
      const order = await readOrderState(state.tx, {
        collection: state.collection.id,
        scopeKey: '',
        lock: true,
      });
      if (order?.version !== input.version) fail('version_conflict');
      const updated = await reorderDocuments(state.tx, {
        ...input,
        collection: state.collection.id,
        scopeKey: '',
        state: order,
        maxKeyBytes: runtime.workPolicy.maxOrderKeyBytes,
      });
      await auditContent(state, {
        runtime,
        id: input.targetId,
        detail: { kind: 'documentsReordered', ids: input.ids, position: input.position },
      });
      return { version: updated };
    },
  );
}

export function createOrderingApi(runtime: ContentRuntime) {
  return {
    getDocumentOrder: (ctx: RequestContext, raw: unknown) => getOrder(runtime, ctx, raw),
    reorderDocuments: (ctx: RequestContext, raw: unknown) => reorder(runtime, ctx, raw),
  };
}
