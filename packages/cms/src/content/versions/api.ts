import { projectDocument } from '../documents/project-document.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { parseQuery } from '../queries/parse-query.ts';
import { expandRelations } from '../documents/expand-relations.ts';
import { createRunner, ensureVisible, parse } from '../runtime.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

export function requireHistory(state: ContentState): void {
  if (state.collection.history === false) fail('invalid_input');
}

async function listVersions(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['versions.list'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'versions.list',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      requireHistory(state);
      await ensureVisible(state, { runtime, id: input.id, trashed: true });
      const page = await runtime.store.listVersions(state.tx, {
        collection: input.collection,
        id: input.id,
        page: input.page,
        pageSize: input.pageSize,
      });
      return {
        ...page,
        rows: page.rows.map((version) => ({
          id: version.id,
          revision: version.revision,
          schemaVersion: version.schemaVersion,
          kind: version.kind,
          actorId: version.actorId,
          createdAt: version.createdAt,
        })),
      };
    },
  );
}

async function getVersion(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['versions.get'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'versions.get',
      collection: input.collection,
      mode: input.mode,
      ...(input.fallback ? { fallbackOverride: input.fallback } : {}),
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      requireHistory(state);
      const { collection: _collection, id: _id, versionId: _versionId, ...readInput } = input;
      const query = parseQuery({
        collection: state.collection,
        input: readInput,
        limits: runtime.limits,
      });
      const document = await ensureVisible(state, { runtime, id: input.id, trashed: true });
      const version = await runtime.store.readRevision(state.tx, {
        collection: input.collection,
        documentId: input.id,
        versionId: input.versionId,
      });
      const view = await projectDocument(state, {
        runtime,
        document,
        versionId: version.id,
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
      return {
        ...view,
        revision: version.revision,
        schemaVersion: version.schemaVersion,
        kind: version.kind,
        actorId: version.actorId,
        createdAt: version.createdAt,
      };
    },
  );
}

export function dataDiff(
  before: DocumentData,
  after: DocumentData,
): { field: string; before: unknown; after: unknown }[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].toSorted();
  return keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((field) => ({ field, before: before[field] ?? null, after: after[field] ?? null }));
}

async function compareVersions(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['versions.diff'], raw);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'versions.diff',
      collection: input.collection,
      ...(input.locale ? { locale: input.locale } : {}),
    },
    async (state) => {
      requireHistory(state);
      const document = await ensureVisible(state, { runtime, id: input.id, trashed: true });
      await runtime.store.readRevision(state.tx, {
        collection: input.collection,
        documentId: input.id,
        versionId: input.from,
      });
      await runtime.store.readRevision(state.tx, {
        collection: input.collection,
        documentId: input.id,
        versionId: input.to,
      });
      const before = await projectDocument(state, { runtime, document, versionId: input.from });
      const after = await projectDocument(state, { runtime, document, versionId: input.to });
      return { from: input.from, to: input.to, changes: dataDiff(before.data, after.data) };
    },
  );
}

export function createVersionReadApi(runtime: ContentRuntime) {
  return {
    listVersions: (ctx: RequestContext, raw: unknown) => listVersions(runtime, ctx, raw),
    getVersion: (ctx: RequestContext, raw: unknown) => getVersion(runtime, ctx, raw),
    compareVersions: (ctx: RequestContext, raw: unknown) => compareVersions(runtime, ctx, raw),
  };
}
