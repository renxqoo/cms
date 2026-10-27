import { readLocaleInput, projectAllLocales } from './all-locales.ts';
import { projectDocument } from '../documents/project-document.ts';
import { adminQuery } from '../queries/admin-context.ts';
import { attachAdminDocumentURLs } from '../editor/document-urls.ts';
import { parseQuery } from '../queries/parse-query.ts';
import { createRunner, ensureVisible, parse, permittedQueryFields } from '../runtime.ts';
import { relationScopes } from './relation-scopes.ts';
import { decorateDocuments } from './project-assets.ts';
import { expandRelations } from './expand-relations.ts';
import { readableQueryFields } from '../fields/policy-metadata.ts';
import { policyScope } from '../hooks/invoke.ts';
import { policyContext } from '../runtime.ts';
import { storedViews } from './stored-views.ts';
import { joinReadContext } from '../joins/context.ts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { QueryInput, StoredPage } from '../model.ts';
import type { ContentState } from '../types.ts';
import type { ContentRuntime } from '../types.ts';

async function listDocuments(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.list'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.list',
      collection: input.collection,
      ...readLocaleInput(input.locale, input.fallback),
      mode: input.mode,
      ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
    },
    async (state) => {
      const { collection: _collection, ...queryInput } = input;
      const query = await adminQuery(
        state,
        runtime,
        parseQuery({
          collection: state.collection,
          input: {
            ...queryInput,
            ...(input.locale === 'all' ? { locale: state.locale, fallback: [] } : {}),
          },
          limits: runtime.limits,
        }),
      );
      const reader = joinReadContext(state, query.joins);
      const page = await runtime.store.queryDocuments(state.tx, {
        collection: input.collection,
        query: { ...query, ...(state.predicate ? { policy: state.predicate } : {}) },
        queryableFields: await permittedQueryFields(state),
        valueReadableFields: await readableQueryFields({
          ...policyScope(state),
          collection: state.collection,
          context: policyContext(state),
        }),
        ...(await relationScopes(state, runtime)),
        limits: runtime.limits,
      });
      return projectPage(reader, runtime, { page, query, all: input.locale === 'all' });
    },
  );
}

async function projectPage(
  state: ContentState,
  runtime: ContentRuntime,
  input: { page: StoredPage; query: QueryInput; all: boolean },
) {
  const { query } = input;
  const rows = await storedViews(state, input.page.rows, {
    runtime,
    ...(query.select ? { select: query.select } : {}),
  });
  await decorateDocuments(state, {
    runtime,
    views: rows,
    schemaVersions: new Map(
      input.page.rows.map((row) => [row.version.id, row.version.schemaVersion]),
    ),
    fallback: query.fallback,
  });
  await expandRelations(state, {
    runtime,
    views: rows,
    ...(query.select ? { select: query.select } : {}),
    depth: query.depth ?? 0,
    budget: (state.expansionBudget ??= { nodes: 0 }),
  });
  if (input.all)
    await projectAllLocales(state, {
      runtime,
      views: rows,
      ...(query.select ? { select: query.select } : {}),
      depth: query.depth ?? 0,
    });
  if (query.context === 'admin') await attachAdminDocumentURLs(state, { runtime, views: rows });
  return { rows, total: input.page.total, page: input.page.page, pageSize: input.page.pageSize };
}

async function readDocument(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.get'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.get',
      collection: input.collection,
      ...readLocaleInput(input.locale, input.fallback),
      mode: input.mode,
      ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
    },
    async (state) => {
      const { collection: _collection, id: _id, ...readInput } = input;
      const query = parseQuery({
        collection: state.collection,
        input: {
          ...readInput,
          ...(input.locale === 'all' ? { locale: state.locale, fallback: [] } : {}),
        },
        limits: runtime.limits,
      });
      const reader = joinReadContext(state, query.joins);
      const document = await ensureVisible(state, { runtime, id: input.id });
      const view = await projectDocument(reader, {
        runtime,
        document,
        ...(query.select ? { select: query.select } : {}),
        fallback: query.fallback,
      });
      await expandRelations(reader, {
        runtime,
        views: [view],
        ...(query.select ? { select: query.select } : {}),
        depth: query.depth ?? 0,
        budget: (state.expansionBudget ??= { nodes: 0 }),
      });
      if (input.locale === 'all')
        await projectAllLocales(reader, {
          runtime,
          views: [view],
          ...(query.select ? { select: query.select } : {}),
          depth: query.depth ?? 0,
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
