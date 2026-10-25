import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentRow } from '../model.ts';

export async function visibleDocuments(
  state: ContentState,
  input: { runtime: ContentRuntime; ids: readonly string[]; trashed?: 'both' | boolean },
): Promise<Map<string, DocumentRow>> {
  const visible = new Map<string, DocumentRow>();
  const ids = [...new Set(input.ids)];
  for (let offset = 0; offset < ids.length; offset += input.runtime.limits.maxPageSize) {
    const chunk = ids.slice(offset, offset + input.runtime.limits.maxPageSize);
    for (const trashed of input.trashed === undefined || input.trashed === 'both'
      ? [false, true]
      : [input.trashed]) {
      const page = await input.runtime.store.queryDocuments(state.tx, {
        collection: state.collection.key,
        query: {
          locale: state.locale,
          mode: 'editing',
          fallback: [],
          page: 1,
          pageSize: chunk.length,
          where: { field: 'id', operator: 'in', value: chunk },
          ...(state.predicate ? { policy: state.predicate } : {}),
          sort: [],
          select: [],
          trashed,
        },
        limits: input.runtime.limits,
      });
      for (const row of page.rows) visible.set(row.document.id, row.document);
    }
  }
  return visible;
}
