import type { JoinQueryOptions } from '../joins/definition.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { queryDefaults, permittedQueryFields } from '../runtime.ts';
import { denied, relationScopes, targetState } from '../documents/relation-scopes.ts';
import { hookReadData } from './read-projection.ts';
import { readJoinedRows } from '../joins/read-rows.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData, FieldDefinition } from '../definition.ts';

interface Input {
  runtime: ContentRuntime;
  collection: string;
  id: string;
}

export function consumeVirtual(state: ContentState, runtime: ContentRuntime): void {
  state.expansionBudget ??= { nodes: 0 };
  state.expansionBudget.nodes += 1;
  if (state.expansionBudget.nodes > runtime.limits.maxExpandNodes) fail('capacity_exceeded');
}

async function readTarget(
  state: ContentState,
  input: Input,
): Promise<{ state: ContentState; data: DocumentData } | undefined> {
  try {
    const target = await targetState(state, input);
    const page = await input.runtime.store.queryDocuments(state.tx, {
      collection: input.collection,
      query: {
        ...queryDefaults(target, input.runtime),
        pageSize: 1,
        where: { field: 'id', operator: 'eq', value: input.id },
        ...(target.predicate ? { policy: target.predicate } : {}),
      },
      queryableFields: await permittedQueryFields(target),
      ...(await relationScopes(target, input.runtime)),
      limits: input.runtime.limits,
    });
    const [row] = page.rows;
    if (!row) return undefined;
    const data = await hookReadData(target, {
      runtime: input.runtime,
      data: row.data,
      documentId: row.document.id,
    });
    (state.readPolicyData ??= new WeakMap()).set(data, row.data);
    target.readPolicyData = state.readPolicyData;
    return { state: target, data };
  } catch (error) {
    if (!denied(error)) throw error;
    return undefined;
  }
}

export function virtualTarget(
  state: ContentState,
  input: Input,
): Promise<{ state: ContentState; data: DocumentData } | undefined> {
  state.virtualReadCache ??= new Map();
  const key = JSON.stringify([
    state.actor.id,
    input.collection,
    input.id,
    state.locale,
    state.mode,
    state.fallbackOverride ?? null,
  ]);
  let result = state.virtualReadCache.get(key);
  if (!result) {
    result = readTarget(state, input);
    state.virtualReadCache.set(key, result);
  }
  return result;
}

export async function virtualJoin(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    field: FieldDefinition;
    id: string;
    query?: JoinQueryOptions;
    identitiesOnly?: boolean;
  },
) {
  const result = await readJoinedRows(state, { ...input, ids: [input.id] });
  const page = result.pages.get(input.id);
  if (!page) fail('temporarily_unavailable');
  const rows: { state: ContentState; id: string; data: DocumentData }[] = [];
  for (const row of page.rows) {
    consumeVirtual(state, input.runtime);
    const reader = result.states.get(row.document.collectionId);
    if (!reader) fail('temporarily_unavailable');
    const data = input.identitiesOnly
      ? {}
      : await hookReadData(reader, {
          runtime: input.runtime,
          data: row.data,
          documentId: row.document.id,
        });
    (state.readPolicyData ??= new WeakMap()).set(data, row.data);
    reader.readPolicyData = state.readPolicyData;
    rows.push({ state: reader, id: row.document.id, data });
  }
  return {
    rows,
    page,
    sort: result.sort,
    ...(result.orderVersion ? { orderVersion: result.orderVersion } : {}),
  };
}
