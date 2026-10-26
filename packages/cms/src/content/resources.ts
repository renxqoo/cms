import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
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
import { expandRelations, storedView } from './documents/expand-relations.ts';
import type { ContentRuntime, ContentState } from './types.ts';

async function resourceScopes(
  runtime: ContentRuntime,
  input: {
    ctx: RequestContext;
    raw: ReturnType<ContentRuntime['schemas']['resources.list']['parse']>;
    tx: ContentState['tx'];
  },
) {
  const scopes = [];
  for (const collection of runtime.registry.list.filter((item) => item.upload)) {
    try {
      scopes.push(await resourceScope(runtime, { ...input, collection }));
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return scopes;
}

async function resourceScope(
  runtime: ContentRuntime,
  input: {
    ctx: RequestContext;
    raw: ReturnType<ContentRuntime['schemas']['resources.list']['parse']>;
    tx: ContentState['tx'];
    collection: ContentState['collection'];
  },
) {
  const collection = await runtime.resolveCollection(input.tx, input.collection.key);
  const actor = await runtime.authorize(input.tx, input.ctx, 'documents.list', {
    scopeKind: 'collection',
    collectionKey: collection.key,
  });
  if (!actor) fail('unauthenticated');
  const state = {
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
  const predicate = collectionPredicate(state);
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
    queryableFields: permittedQueryFields(state),
    ...(await relationScopes(state, runtime)),
  };
}

async function listResources(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['resources.list'], raw);
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    ...(ctx.signal ? { signal: ctx.signal } : {}),
    async work(tx) {
      const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
      await runtime.authorize(executor, ctx, 'resources.list');
      const scopes = await resourceScopes(runtime, { ctx, raw: input, tx: executor });
      const page = await runtime.store.queryCollections(executor, {
        collections: scopes,
        page: input.page,
        pageSize: input.pageSize,
        sort: input.sort ?? [{ field: 'createdAt', order: 'desc' }],
        limits: runtime.limits,
      });
      const rows = page.rows.map((row) => {
        const scope = scopes.find((item) => item.state.collection.id === row.document.collectionId);
        if (!scope) fail('internal_error');
        return storedView(scope.state, row, input.select);
      });
      const budget = { nodes: 0 };
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
      return {
        rows: rows.slice(offset, offset + input.pageSize),
        total: rows.length,
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
