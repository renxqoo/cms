import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { createRunner, parse } from '../runtime.ts';
import { expandRelations } from '../documents/expand-relations.ts';
import { normalizedJoinQuery } from './input.ts';
import { joinSource } from './source.ts';
import { joinedPages } from './pages.ts';
import { reorderJoinedDocuments } from './reorder.ts';
import type { ContentRuntime } from '../types.ts';

async function readJoin(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['documents.join'], raw);
  const { collection, id, fieldId, locale, mode, fallback, depth, ...values } = input;
  if ((depth ?? 1) > runtime.limits.maxExpandDepth) fail('invalid_input');
  const query = normalizedJoinQuery(values, runtime.limits);
  return createRunner(runtime)(
    {
      ctx,
      operationId: 'documents.join',
      collection,
      mode,
      ...(locale ? { locale } : {}),
      ...(fallback ? { fallbackOverride: fallback } : {}),
    },
    async (state) => {
      const source = await joinSource(state, { runtime, id, fieldId });
      const pages = await joinedPages(source.reader, {
        runtime,
        field: source.field,
        ids: [source.document.id],
        query,
        depth: depth ?? 1,
        budget: (source.reader.expansionBudget ??= { nodes: 0 }),
        expand: expandRelations,
      });
      const page = pages.get(source.document.id);
      if (!page) fail('temporarily_unavailable');
      return page;
    },
  );
}

export function createJoinApi(runtime: ContentRuntime) {
  return {
    getJoinedDocuments: (ctx: RequestContext, raw: unknown) => readJoin(runtime, ctx, raw),
    reorderJoinedDocuments: (ctx: RequestContext, raw: unknown) =>
      reorderJoinedDocuments(runtime, ctx, raw),
  };
}
