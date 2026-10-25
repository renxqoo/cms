import { fail } from '@new-cms/cms/platform/contracts';
import {
  authorizeStateOperation,
  collectionPredicate,
  ensureVisible,
  resolveLocale,
} from '../runtime.ts';
import { denied, targetState } from '../documents/relation-scopes.ts';
import { itemOperation } from './execute-item.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { JobItemRow, JobRow } from './store.ts';
import type { Where } from '../definition.ts';

async function operationState(
  state: ContentState,
  input: { runtime: ContentRuntime; operationId: string; locale: string },
): Promise<ContentState> {
  const actor = await authorizeStateOperation(state, {
    runtime: input.runtime,
    operationId: input.operationId,
    collection: state.collection.key,
  });
  if (!actor) fail('unauthenticated');
  const next = {
    ...state,
    actor,
    operationId: input.operationId,
    locale: resolveLocale(state.collection, input.locale),
  };
  const predicate = collectionPredicate(next);
  const all = [state.predicate, predicate].filter((item): item is Where => item !== undefined);
  const { predicate: _old, ...base } = next;
  return { ...base, ...(all.length > 0 ? { predicate: { and: all } } : {}) };
}

async function visibleIds(
  state: ContentState,
  input: { runtime: ContentRuntime; ids: readonly string[] },
): Promise<Set<string>> {
  const visible = new Set<string>();
  const ids = [...new Set(input.ids)];
  for (let offset = 0; offset < ids.length; offset += input.runtime.limits.maxPageSize) {
    const chunk = ids.slice(offset, offset + input.runtime.limits.maxPageSize);
    for (const trashed of [false, true]) {
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
      for (const row of page.rows) visible.add(row.document.id);
    }
  }
  return visible;
}

function projectedStatus(job: JobRow, items: { status: string }[]) {
  if (job.status === 'cancelled') return 'cancelled';
  if (items.some((item) => item.status === 'queued'))
    return job.status === 'running' ? 'running' : 'queued';
  const failures = items.filter((item) => item.status === 'failed').length;
  if (failures === 0) return 'succeeded';
  return failures === items.length ? 'failed' : 'partial';
}

async function visibleItems(
  state: ContentState,
  input: { runtime: ContentRuntime; job: JobRow; rows: JobItemRow[] },
) {
  const original = await operationState(state, {
    runtime: input.runtime,
    operationId: input.job.source_operation,
    locale: state.locale,
  });
  const reader = await targetState(original, {
    runtime: input.runtime,
    collection: state.collection.key,
  });
  const visibleResults = await visibleIds(reader, {
    runtime: input.runtime,
    ids: input.rows.map((item) => item.result_document_id ?? item.document_id),
  });
  const visibleSources = new Set<string>();
  for (const action of new Set(input.rows.map((item) => item.payload.action))) {
    const group = input.rows.filter((item) => item.payload.action === action);
    const locale = group[0]?.payload.locale ?? state.locale;
    try {
      const authorized = await operationState(original, {
        runtime: input.runtime,
        operationId:
          input.job.action === 'publication' ? 'documents.publish' : itemOperation(action),
        locale,
      });
      const ids = await visibleIds(authorized, {
        runtime: input.runtime,
        ids: group.map((item) => item.document_id),
      });
      for (const id of ids) visibleSources.add(id);
    } catch (error) {
      if (!denied(error)) throw error;
    }
  }
  return projectItems(input.rows, { visibleSources, visibleResults });
}

function projectItems(
  rows: readonly JobItemRow[],
  input: { visibleSources: ReadonlySet<string>; visibleResults: ReadonlySet<string> },
) {
  return rows
    .filter(
      (item) =>
        input.visibleSources.has(item.document_id) &&
        input.visibleResults.has(item.result_document_id ?? item.document_id),
    )
    .map((item) => ({
      position: item.position,
      id: item.document_id,
      status: item.status,
      ...(item.result_document_id ? { resultId: item.result_document_id } : {}),
      ...(item.result_revision_id ? { versionId: item.result_revision_id } : {}),
      ...(item.error_code ? { error: { code: item.error_code } } : {}),
    }));
}

export async function projectJob(
  state: ContentState,
  input: { runtime: ContentRuntime; job: JobRow },
) {
  const result = await state.tx.query<JobItemRow>(
    'SELECT * FROM content_job_items WHERE job_id=$1 ORDER BY position LIMIT $2',
    [input.job.id, input.runtime.workPolicy.maxBatchItems + 1],
  );
  if (result.rows.length > input.runtime.workPolicy.maxBatchItems) fail('capacity_exceeded');
  const items = await visibleItems(state, { ...input, rows: result.rows });
  if (input.job.action !== 'extension' && items.length === 0) fail('not_found');
  if (input.job.action === 'extension') {
    if (!input.job.document_id) fail('not_found');
    const original = await operationState(state, {
      runtime: input.runtime,
      operationId: input.job.source_operation,
      locale: state.locale,
    });
    const reader = await targetState(original, {
      runtime: input.runtime,
      collection: state.collection.key,
    });
    await ensureVisible(reader, { runtime: input.runtime, id: input.job.document_id });
  }
  return {
    id: input.job.id,
    collection: state.collection.key,
    action: input.job.action,
    status: input.job.action === 'extension' ? input.job.status : projectedStatus(input.job, items),
    executeAt: input.job.execute_at.toISOString(),
    createdAt: input.job.created_at.toISOString(),
    finishedAt: input.job.finished_at?.toISOString() ?? null,
    total: items.length,
    succeeded: items.filter((item) => item.status === 'succeeded').length,
    failed: items.filter((item) => item.status === 'failed').length,
    items,
  };
}
