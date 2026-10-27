import { authorReadPermission } from './authorship/api.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { withContentDeadline } from './hooks/deadline.ts';
import { targetReadContext } from './queries/resolve-locale.ts';
import { parseQuery } from './queries/parse-query.ts';
import {
  budgetedExecutor,
  collectionPredicate,
  createRunner,
  ensureVisible,
  parse,
  permittedQueryFields,
} from './runtime.ts';
import { denied, relationScopes } from './documents/relation-scopes.ts';
import { decorateDocuments } from './documents/project-assets.ts';
import { projectReferenceGroup } from './documents/reference-query.ts';
import { expandRelations } from './documents/expand-relations.ts';
import { storedView } from './documents/stored-views.ts';
import type { ContentRuntime, ContentState, ContentDocumentView } from './types.ts';
import type { StoredDocument } from './model.ts';

async function resourceScopes(
  runtime: ContentRuntime,
  input: {
    ctx: RequestContext;
    raw: ReturnType<ContentRuntime['schemas']['resources.list']['parse']>;
    tx: ContentState['tx'];
  },
) {
  const scopes = [];
  const hookBudget = { used: 0 };
  for (const collection of runtime.registry.list.filter((item) => item.upload)) {
    try {
      scopes.push(await resourceScope(runtime, { ...input, collection, hookBudget }));
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return scopes;
}

interface ResourceScopeInput {
  ctx: RequestContext;
  raw: ReturnType<ContentRuntime['schemas']['resources.list']['parse']>;
  tx: ContentState['tx'];
  collection: ContentState['collection'];
  hookBudget: { used: number };
}
async function resourceScope(runtime: ContentRuntime, input: ResourceScopeInput) {
  const collection = await runtime.resolveCollection(input.tx, input.collection.key);
  const actor = await runtime.authorize(input.tx, input.ctx, 'documents.list', {
    scopeKind: 'collection',
    collectionKey: collection.key,
  });
  if (!actor) fail('unauthenticated');
  const state = {
    authorshipReadable: false,
    hookBudget: input.hookBudget,
    hookLimits: runtime.limits,
    tx: input.tx,
    ctx: input.ctx,
    actor,
    collection,
    ...targetReadContext({
      collection,
      locale: input.raw.locale ?? collection.locales.default,
      ...(input.raw.fallback ? { fallback: input.raw.fallback } : {}),
    }),
    ...(input.raw.fallback ? { fallbackOverride: input.raw.fallback } : {}),
    operationId: 'documents.list',
    mode: input.raw.mode,
  };
  const predicate = await collectionPredicate(state);
  state.authorshipReadable = await authorReadPermission(state, runtime);
  const query = parseQuery({
    collection,
    input: {
      ...input.raw,
      locale: state.locale,
      fallback: state.fallback,
      sort: input.raw.sort ?? [{ field: 'createdAt', order: 'desc' }],
    },
    limits: runtime.limits,
  });
  return {
    state,
    collection: collection.key,
    query: { ...query, ...(predicate ? { policy: predicate } : {}) },
    queryableFields: await permittedQueryFields(state),
    ...(await relationScopes(state, runtime)),
  };
}

async function resourceViews(
  runtime: ContentRuntime,
  input: {
    scopes: Awaited<ReturnType<typeof resourceScopes>>;
    rows: readonly StoredDocument[];
    select?: readonly string[];
  },
): Promise<ContentDocumentView[]> {
  const rows = [];
  for (const row of input.rows) {
    const scope = input.scopes.find(
      (item) => item.state.collection.id === row.document.collectionId,
    );
    if (!scope) fail('internal_error');
    rows.push(
      await storedView(scope.state, row, {
        runtime,
        ...(input.select ? { select: input.select } : {}),
      }),
    );
  }
  return rows;
}

function shareBudgets(scopes: Awaited<ReturnType<typeof resourceScopes>>) {
  const budget = { nodes: 0 };
  const hookBudget = scopes[0]?.state.hookBudget ?? { used: 0 };
  const virtualReadCache = new Map();
  for (const scope of scopes)
    Object.assign(scope.state, { expansionBudget: budget, hookBudget, virtualReadCache });
  return budget;
}

async function listResources(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['resources.list'], raw);
  return withContentDeadline({
    timeoutMs: runtime.policy.requestTimeoutMs,
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    work: (signal) => queryResources(runtime, { ...ctx, signal }, input),
  });
}

async function queryResources(
  runtime: ContentRuntime,
  ctx: RequestContext,
  input: ReturnType<ContentRuntime['schemas']['resources.list']['parse']>,
) {
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    async work(tx) {
      const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
      await runtime.authorize(executor, ctx, 'resources.list');
      const scopes = await resourceScopes(runtime, { ctx, raw: input, tx: executor });
      const budget = shareBudgets(scopes);
      const page = await runtime.store.queryCollections(executor, {
        collections: scopes,
        page: input.page,
        pageSize: input.pageSize,
        sort: input.sort ?? [{ field: 'createdAt', order: 'desc' }],
        limits: runtime.limits,
      });
      const rows = await resourceViews(runtime, {
        scopes,
        rows: page.rows,
        ...(input.select ? { select: input.select } : {}),
      });
      for (const scope of scopes) {
        const views = rows.filter((row) => row.collection === scope.collection);
        await decorateDocuments(scope.state, {
          runtime,
          views,
          schemaVersions: new Map(
            page.rows.map((row) => [row.version.id, row.version.schemaVersion]),
          ),
          ...(input.fallback ? { fallback: input.fallback } : {}),
        });
        await expandRelations(scope.state, {
          runtime,
          views,
          ...(input.select ? { select: input.select } : {}),
          depth: input.depth ?? 0,
          budget,
        });
      }
      const response = { rows, total: page.total, page: page.page, pageSize: page.pageSize };
      if (Buffer.byteLength(JSON.stringify(response)) > runtime.limits.maxResponseBytes)
        fail('capacity_exceeded');
      return response;
    },
  });
}

async function listReferences(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['resources.references'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'resources.references', collection: input.collection },
    async (state) => {
      await ensureVisible(state, { runtime, id: input.id, trashed: true });
      const references = await runtime.store.inboundReferences(state.tx, {
        collection: input.collection,
        id: input.id,
        limit: runtime.limits.maxExpandNodes + 1,
      });
      if (references.length > runtime.limits.maxExpandNodes) fail('capacity_exceeded');
      const rows = [];
      for (const collection of new Set(references.map((reference) => reference.sourceCollection))) {
        try {
          rows.push(
            ...(await projectReferenceGroup(state, {
              runtime,
              collection,
              references: references.filter(
                (reference) => reference.sourceCollection === collection,
              ),
              targetId: input.id,
            })),
          );
        } catch (error) {
          if (!denied(error)) throw error;
        }
      }
      const offset = (input.page - 1) * input.pageSize;
      if (!Number.isSafeInteger(offset)) fail('invalid_input');
      const unique = [
        ...new Map(
          rows.map((row) => [
            JSON.stringify([row.collection, row.id, row.versionId, row.sourcePath]),
            row,
          ]),
        ).values(),
      ];
      return {
        rows: unique.slice(offset, offset + input.pageSize),
        total: unique.length,
        page: input.page,
        pageSize: input.pageSize,
      };
    },
  );
}

export function createResourceApi(runtime: ContentRuntime) {
  return {
    listResources: (ctx: RequestContext, raw: unknown) => listResources(runtime, ctx, raw),
    listReferences: (ctx: RequestContext, raw: unknown) => listReferences(runtime, ctx, raw),
  };
}
