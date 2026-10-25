import { projectDocument } from '../documents/project-document.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { createRunner, ensureVisible, parse, permittedQueryFields } from '../runtime.ts';
import { relationScopes } from './relation-scopes.ts';
import { decorateDocuments } from './project-assets.ts';
import { expandRelations, storedView } from './expand-relations.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime } from '../types.ts';

async function listDocuments(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.list'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.list',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
      mode: input.mode,
      ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
    },
    async (state) => {
      const { collection: _collection, ...queryInput } = input;
      const query = parseQuery({
        collection: state.collection,
        input: queryInput,
        limits: runtime.limits,
      });
      const page = await runtime.store.queryDocuments(state.tx, {
        collection: input.collection,
        query: { ...query, ...(state.predicate ? { policy: state.predicate } : {}) },
        queryableFields: permittedQueryFields(state),
        ...(await relationScopes(state, runtime)),
        limits: runtime.limits,
      });
      const rows = page.rows.map((row) => storedView(state, row, query.select));
      await decorateDocuments(state, {
        runtime,
        views: rows,
        schemaVersions: new Map(
          page.rows.map((row) => [row.version.id, row.version.schemaVersion]),
        ),
        fallback: query.fallback,
      });
      await expandRelations(state, {
        runtime,
        views: rows,
        ...(query.select ? { select: query.select } : {}),
        depth: query.depth ?? 0,
        budget: { nodes: 0 },
      });
      return { rows, total: page.total, page: page.page, pageSize: page.pageSize };
    },
  );
}

async function readDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.get'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.get',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
      mode: input.mode,
      ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
    },
    async (state) => {
      const { collection: _collection, id: _id, ...readInput } = input;
      const query = parseQuery({
        collection: state.collection,
        input: readInput,
        limits: runtime.limits,
      });
      const document = await ensureVisible(state, { runtime, id: input.id });
      const view = await projectDocument(state, {
        runtime,
        document,
        ...(query.select ? { select: query.select } : {}),
        fallback: query.fallback,
      });
      await expandRelations(state, {
        runtime,
        views: [view],
        ...(query.select ? { select: query.select } : {}),
        depth: query.depth ?? 0,
        budget: { nodes: 0 },
      });
      return view;
    },
  );
}

export function createReadDocumentApi(runtime: ContentRuntime) {
  return {
    listDocuments: (ctx: RequestContext, raw: unknown) => listDocuments(runtime, ctx, raw),
    getDocument: (ctx: RequestContext, raw: unknown) => readDocument(runtime, ctx, raw),
  };
}
