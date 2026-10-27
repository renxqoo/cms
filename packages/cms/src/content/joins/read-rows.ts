import type { JoinQueryOptions } from './definition.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { queryDefaults, permittedQueryFields } from '../runtime.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { denied, targetState, relationScopes } from '../documents/relation-scopes.ts';
import { readOrderState } from '../adapters/postgres/order-state.ts';
import { joinCollections, joinOrderScope, sortableJoinField } from './config.ts';
import { fieldPaths } from '../fields/structure.ts';
import { joinConstraint } from './constraint.ts';
import type { FieldDefinition, SortField } from '../definition.ts';
import type { Where } from '../definition.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { CollectionsQueryInput } from '../adapters/postgres/store-contract.ts';

interface Target {
  state: ContentState;
  fields: readonly string[];
  scopes: Awaited<ReturnType<typeof relationScopes>>;
}
interface Input {
  runtime: ContentRuntime;
  field: FieldDefinition;
  ids: readonly string[];
  query?: JoinQueryOptions;
  identitiesOnly?: boolean;
  occurrences?: ReadonlyMap<string, number>;
  maxRows?: number;
}
const metadataTypes: Readonly<Record<string, string>> = {
  id: 'uuid',
  revision: 'number',
  createdAt: 'date',
  updatedAt: 'date',
  trashedAt: 'date',
  folderId: 'uuid',
};

async function targets(state: ContentState, input: Input): Promise<Target[]> {
  if (!input.field.join) fail('invalid_input');
  const result: Target[] = [];
  for (const collection of joinCollections(input.field.join)) {
    try {
      const reader = await targetState(state, { runtime: input.runtime, collection });
      result.push({
        state: reader,
        fields: await permittedQueryFields(reader),
        scopes: await relationScopes(reader, input.runtime),
      });
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return result;
}

function sortFamily(path: string, target: Target, orderable: boolean): string | undefined {
  if (Object.hasOwn(metadataTypes, path)) return metadataTypes[path];
  if (path === '_order')
    return orderable || target.state.collection.orderable ? 'number' : undefined;
  if (!target.fields.includes(path)) return undefined;
  const entry = fieldPaths(target.state.collection.fields).find((field) => field.path === path);
  if (!entry || entry.repeated || !sortableJoinField(entry.field)) return undefined;
  const { type } = entry.field;
  if (['relationship', 'upload'].includes(type)) return 'uuid';
  return ['number', 'boolean', 'date'].includes(type) ? type : 'text';
}

function sharedSort(input: Input, readers: readonly Target[]): readonly SortField[] {
  const { join } = input.field;
  if (!join) fail('invalid_input');
  if (readers.length === 0) return [];
  const first = readers[0]?.state.collection.defaultSort;
  const fallback = readers.every(
    (reader) => JSON.stringify(reader.state.collection.defaultSort) === JSON.stringify(first),
  )
    ? first
    : undefined;
  const configured = join.defaultSort ??
    (join.orderable ? [{ field: '_order', order: 'asc' } as const] : fallback) ?? [
      { field: 'updatedAt', order: 'desc' } as const,
    ];
  const candidate = input.query?.sort ?? configured;
  if (new Set(candidate.map((sort) => sort.field)).size !== candidate.length) fail('invalid_input');
  return candidate.filter((sort) => {
    const families = readers.map((reader) =>
      sortFamily(sort.field, reader, join.orderable === true),
    );
    const allowed = families.every((family) => family !== undefined && family === families[0]);
    if (!allowed && input.query?.sort !== undefined) fail('forbidden');
    return allowed;
  });
}

function groupQueries(
  state: ContentState,
  input: Input & { readers: readonly Target[]; sort: readonly SortField[] },
) {
  const { readers, sort } = input;
  const { join } = input.field;
  if (!join) fail('invalid_input');
  const groups: {
    key: string;
    collections: CollectionsQueryInput['collections'];
    copies: number;
  }[] = [];
  const { count: _count, ...options } = input.query ?? {};
  for (const id of input.ids) {
    const collections = [];
    for (const reader of readers) {
      const query = parseQuery({
        collection: reader.state.collection,
        limits: input.runtime.limits,
        input: {
          ...queryDefaults(reader.state, input.runtime),
          ...options,
          sort,
          page: input.query?.page ?? 1,
          pageSize:
            input.query?.pageSize ?? join.defaultPageSize ?? input.runtime.limits.defaultPageSize,
          ...(reader.state.predicate ? { policy: reader.state.predicate } : {}),
          ...(input.identitiesOnly ? { select: [] } : {}),
        },
      });
      collections.push({
        collection: reader.state.collection.key,
        query,
        queryableFields: reader.fields,
        where: joinConstraint(state.collection.key, id, join),
        ...reader.scopes,
        ...(join.orderable ? { orderScope: joinOrderScope(state.collection.id, input.field) } : {}),
      });
    }
    groups.push({ key: id, collections, copies: input.occurrences?.get(id) ?? 1 });
  }
  return groups;
}

export async function readJoinedRows(state: ContentState, input: Input) {
  const { join } = input.field;
  if (!join) fail('invalid_input');
  const readers = await targets(state, input);
  const sort = sharedSort(input, readers);
  const orderVersion = await readJoinOrder(state, input, readers);
  const groups = groupQueries(state, { ...input, readers, sort });
  const page = input.query?.page ?? 1;
  const pageSize =
    input.query?.pageSize ?? join.defaultPageSize ?? input.runtime.limits.defaultPageSize;
  const pages = await input.runtime.store.queryJoinedDocuments(state.tx, {
    groups,
    page,
    pageSize,
    sort,
    count: input.query?.count === true,
    limits: input.runtime.limits,
    maxRows:
      input.maxRows ??
      Math.max(0, input.runtime.limits.maxExpandNodes - (state.expansionBudget?.nodes ?? 0)),
  });
  return {
    pages,
    sort: hasNear(input.query?.where) || hasNear(join.where) ? [] : sort,
    states: new Map(readers.map((reader) => [reader.state.collection.id, reader.state])),
    ...(orderVersion === null ? {} : { orderVersion }),
  };
}

function hasNear(where: Where | undefined): boolean {
  if (!where) return false;
  if ('and' in where) return where.and.some(hasNear);
  if ('or' in where) return where.or.some(hasNear);
  return where.operator === 'near';
}

async function readJoinOrder(state: ContentState, input: Input, readers: readonly Target[]) {
  const { join } = input.field;
  if (join?.orderable && state.mode === 'editing' && readers[0]) {
    const order = await readOrderState(state.tx, {
      collection: readers[0].state.collection.id,
      scopeKey: joinOrderScope(state.collection.id, input.field),
    });
    if (!order) fail('temporarily_unavailable');
    return order.version;
  }
  return null;
}
