import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../types.ts';
import { hierarchySettings } from '../collections/hierarchy-config.ts';
import {
  createRunner,
  parse,
  ensureVisible,
  permittedQueryFields,
  idempotentReference,
  requireAdditionalOperation,
} from '../runtime.ts';
import { operationState } from '../editor/context.ts';
import { relationScopes } from '../documents/relation-scopes.ts';
import { projectDocument } from '../documents/project-document.ts';
import { saveInTransaction } from '../documents/save-document.ts';
import { parseQuery } from '../queries/parse-query.ts';
import type { Where } from '../definition.ts';

async function treeReaders(state: ContentState, runtime: ContentRuntime) {
  const list = await operationState(state, {
    runtime,
    operationId: 'documents.list',
    mode: state.mode,
  });
  const reader = await operationState(state, {
    runtime,
    operationId: 'documents.get',
    mode: state.mode,
  });
  const predicates = [state.predicate, list.predicate, reader.predicate].filter(
    (value): value is Where => value !== undefined,
  );
  return { reader, ...(predicates.length > 0 ? { predicate: { and: predicates } } : {}) };
}

type TreeInput = ReturnType<ContentRuntime['schemas']['hierarchy.tree']['parse']>;
type MoveInput = ReturnType<ContentRuntime['schemas']['hierarchy.move']['parse']>;

async function queryTree(
  state: ContentState,
  input: { runtime: ContentRuntime; query: TreeInput; reader: ContentState; predicate?: Where },
) {
  const { runtime, query, reader } = input;
  const options = hierarchySettings(state.collection);
  if (!options) fail('invalid_input');
  const queryableFields = await permittedQueryFields(reader);
  if (!queryableFields.includes(options.parentFieldName)) fail('forbidden');
  if (query.parentId) await ensureVisible(reader, { runtime, id: query.parentId });
  const pageSize = Math.min(
    query.pageSize ?? options.admin.treeLimit ?? runtime.limits.defaultPageSize,
    options.admin.treeLimit ?? runtime.limits.maxPageSize,
  );
  return runtime.store.queryDocuments(state.tx, {
    collection: state.collection.key,
    query: parseQuery({
      collection: state.collection,
      limits: runtime.limits,
      input: {
        page: query.page,
        pageSize,
        locale: state.locale,
        fallback: [],
        mode: state.mode,
        where: {
          field: options.parentFieldName,
          operator: query.parentId ? 'eq' : 'exists',
          value: query.parentId ? { collection: state.collection.key, id: query.parentId } : false,
        },
        ...(input.predicate ? { policy: input.predicate } : {}),
        sort: state.collection.defaultSort ?? [],
      },
    }),
    queryableFields,
    ...(await relationScopes(reader, runtime)),
    limits: runtime.limits,
  });
}

async function treeInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; query: TreeInput },
) {
  const { runtime, query } = input;
  const readers = await treeReaders(state, runtime);
  const page = await queryTree(state, { runtime, query, ...readers });
  const rows = [];
  for (const row of page.rows)
    rows.push(
      await projectDocument(readers.reader, {
        runtime,
        document: row.document,
        versionId: row.version.id,
        fallback: [],
      }),
    );
  return {
    parentId: query.parentId,
    rows,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
  };
}

function readTree(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const query = parse(runtime.schemas['hierarchy.tree'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'hierarchy.tree',
      collection: query.collection,
      mode: query.mode,
      ...(query.locale ? { locale: query.locale } : {}),
      fallbackOverride: [],
    },
    (state) => treeInTransaction(state, { runtime, query }),
  );
}

async function applyMoves(
  state: ContentState,
  input: { runtime: ContentRuntime; query: MoveInput; parentField: string },
) {
  const { runtime, query } = input;
  for (const item of query.items) {
    await ensureVisible(state, { runtime, id: item.id });
    await requireAdditionalOperation(state, { runtime, operationId: 'documents.get', id: item.id });
    const writer = await requireAdditionalOperation(state, {
      runtime,
      operationId: 'documents.update',
      id: item.id,
    });
    await saveInTransaction(writer, {
      runtime,
      values: {
        collection: query.collection,
        id: item.id,
        revision: item.revision,
        locale: state.locale,
        data: {
          [input.parentField]: query.parentId
            ? { collection: query.collection, id: query.parentId }
            : null,
        },
      },
      kind: 'hierarchyMoved',
    });
  }
  return { ids: query.items.map((item) => item.id) };
}

async function moveInTransaction(
  state: ContentState,
  input: { runtime: ContentRuntime; query: MoveInput },
) {
  const { runtime, query } = input;
  const options = hierarchySettings(state.collection);
  if (!options) fail('invalid_input');
  if (query.parentId && query.items.some((item) => item.id === query.parentId))
    fail('invalid_input');
  const reference = await idempotentReference(state, { runtime, input: query }, () =>
    applyMoves(state, { runtime, query, parentField: options.parentFieldName }),
  );
  const reader = await operationState(state, {
    runtime,
    operationId: 'documents.get',
    mode: 'editing',
  });
  const rows = [];
  for (const id of reference.ids)
    rows.push(
      await projectDocument(reader, {
        runtime,
        document: await ensureVisible(reader, { runtime, id }),
      }),
    );
  return { rows };
}

function moveNodes(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const query = parse(runtime.schemas['hierarchy.move'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'hierarchy.move',
      ...(query.items.length > 1 ? { batchOperation: 'documents.update' } : {}),
      collection: query.collection,
      ...(query.locale ? { locale: query.locale } : {}),
    },
    (state) => moveInTransaction(state, { runtime, query }),
  );
}

export function createHierarchyApi(runtime: ContentRuntime) {
  return {
    readHierarchy: (ctx: RequestContext, raw: unknown) => readTree(runtime, ctx, raw),
    moveHierarchy: (ctx: RequestContext, raw: unknown) => moveNodes(runtime, ctx, raw),
  };
}
