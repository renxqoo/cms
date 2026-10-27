import type { JoinDefinition } from './definition.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, parse, auditContent, queryDefaults } from '../runtime.ts';
import { targetState, relationScopes } from '../documents/relation-scopes.ts';
import { operationState } from '../editor/context.ts';
import { visibleDocuments } from '../documents/visible-documents.ts';
import { readOrderState } from '../adapters/postgres/order-state.ts';
import { reorderDocuments } from '../adapters/postgres/order-store.ts';
import { joinSource } from './source.ts';
import { joinCollections, joinOrderScope } from './config.ts';
import { joinConstraint } from './constraint.ts';
import type { ContentRuntime, ContentState } from '../types.ts';

async function visible(
  state: ContentState,
  input: { runtime: ContentRuntime; ids: readonly string[] },
) {
  const rows = await visibleDocuments(state, { ...input, trashed: false });
  if (input.ids.some((id) => !rows.has(id))) fail('not_found');
}

async function eligible(
  state: ContentState,
  input: { runtime: ContentRuntime; ids: readonly string[]; moved: readonly string[] },
) {
  const reader = await operationState(state, {
    runtime: input.runtime,
    operationId: 'documents.list',
    mode: 'editing',
  });
  const writer = await operationState(state, {
    runtime: input.runtime,
    operationId: 'documents.update',
    mode: 'editing',
  });
  const order = await operationState(state, {
    runtime: input.runtime,
    operationId: 'documents.reorder',
    mode: 'editing',
  });
  await visible(reader, { runtime: input.runtime, ids: input.ids });
  await visible(writer, { runtime: input.runtime, ids: input.moved });
  await visible(order, { runtime: input.runtime, ids: input.moved });
}

async function members(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    sourceCollection: string;
    sourceId: string;
    join: JoinDefinition;
    ids: readonly string[];
  },
) {
  const result = await input.runtime.store.queryDocuments(state.tx, {
    collection: state.collection.key,
    query: {
      ...queryDefaults(state, input.runtime),
      pageSize: 1,
      select: [],
      sort: [],
      where: { field: 'id', operator: 'in', value: [...input.ids] },
      ...(state.predicate ? { policy: state.predicate } : {}),
    },
    where: joinConstraint(input.sourceCollection, input.sourceId, input.join),
    queryableFields: [],
    ...(await relationScopes(state, input.runtime)),
    limits: input.runtime.limits,
  });
  if (result.total !== input.ids.length) fail('not_found');
}

export function reorderJoinedDocuments(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.reorderJoin'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.reorderJoin',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      const ids = [...input.ids, input.targetId];
      await runtime.store.lockDocuments(state.tx, {
        ids: [...new Set([input.id, ...ids])].toSorted(),
      });
      const source = await joinSource(state, { runtime, id: input.id, fieldId: input.fieldId });
      const { join } = source.field;
      if (!join?.orderable) fail('invalid_input');
      const [collection] = joinCollections(join);
      if (!collection) fail('invalid_input');
      const target = await targetState(source.reader, { runtime, collection });
      await eligible(target, { runtime, ids, moved: input.ids });
      await members(target, {
        runtime,
        sourceCollection: source.reader.collection.key,
        sourceId: source.document.id,
        join,
        ids,
      });
      const scopeKey = joinOrderScope(state.collection.id, source.field);
      const order = await readOrderState(state.tx, {
        collection: target.collection.id,
        scopeKey,
        lock: true,
      });
      if (order?.version !== input.version) fail('version_conflict');
      const version = await reorderDocuments(state.tx, {
        collection: target.collection.id,
        scopeKey,
        ids: input.ids,
        targetId: input.targetId,
        position: input.position,
        state: order,
        maxKeyBytes: runtime.workPolicy.maxOrderKeyBytes,
      });
      await auditReorder(state, { runtime, sourceId: source.document.id, input });
      return { version };
    },
  );
}

async function auditReorder(
  state: ContentState,
  values: {
    runtime: ContentRuntime;
    sourceId: string;
    input: {
      fieldId: string;
      ids: readonly string[];
      targetId: string;
      position: 'before' | 'after';
    };
  },
) {
  const { runtime, sourceId: id, input } = values;
  await auditContent(state, {
    runtime,
    id,
    detail: {
      kind: 'joinedDocumentsReordered',
      fieldId: input.fieldId,
      ids: input.ids,
      targetId: input.targetId,
      position: input.position,
    },
  });
}
