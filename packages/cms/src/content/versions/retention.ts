import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../types.ts';

type RetentionState = Pick<ContentState, 'tx' | 'collection'>;

export async function protectedVersions(
  state: RetentionState,
  input: { runtime: ContentRuntime; documentId: string },
): Promise<Set<string> | undefined> {
  const document = await input.runtime.store.readDocument(state.tx, {
    collection: state.collection.key,
    id: input.documentId,
  });
  const jobs = await state.tx.query<{ version_id: string }>(
    "SELECT DISTINCT version_id FROM content_jobs WHERE document_id=$1 AND version_id IS NOT NULL AND status IN('queued','running') LIMIT $2",
    [input.documentId, input.runtime.limits.maxArrayItems + 1],
  );
  const protectedIds = new Set([
    document.currentVersionId,
    ...(document.publishedVersionId ? [document.publishedVersionId] : []),
    ...jobs.rows.map((row) => row.version_id),
  ]);
  return protectedIds.size > input.runtime.limits.maxArrayItems ? undefined : protectedIds;
}

export async function pruneDocumentVersions(
  state: RetentionState,
  input: { runtime: ContentRuntime; documentId: string },
): Promise<number> {
  const protectedIds = await protectedVersions(state, input);
  if (!protectedIds) return 0;
  const now = await state.tx.query<{ now: Date }>('SELECT clock_timestamp() AS now');
  const instant = now.rows[0]?.now.getTime();
  if (instant === undefined) fail('temporarily_unavailable');
  const { history } = state.collection;
  const candidates = await input.runtime.store.listPrunableVersions(state.tx, {
    collection: state.collection.key,
    id: input.documentId,
    keepLatest: history ? history.maxVersions : 0,
    olderThan: history ? new Date(instant - history.retentionMs).toISOString() : null,
    protectedIds: [...protectedIds],
    limit: Math.min(input.runtime.workPolicy.jobBatchSize, input.runtime.limits.maxPageSize),
  });
  for (const version of candidates) {
    await input.runtime.assets?.releaseRevision(state.tx, { revisionId: version.id });
    await input.runtime.store.removeRevision(state.tx, {
      collection: state.collection.key,
      documentId: input.documentId,
      versionId: version.id,
    });
  }
  return candidates.length;
}
