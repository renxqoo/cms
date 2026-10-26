import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { randomUUID } from 'node:crypto';
import { prunePreviewGrants } from '../delivery/preview.ts';
import { pruneDocumentVersions } from '../versions/retention.ts';
import { ensureVisible, budgetedExecutor, lockContentMutation } from '../runtime.ts';
import { claimJobs, completeJob, fenceJob, queuedItems } from './store.ts';
import { executeJobItem, failJob, jobState } from './execute-item.ts';
import type { JobRow } from './store.ts';
import type { ContentRuntime } from '../types.ts';

async function runExtension(
  runtime: ContentRuntime,
  input: { job: JobRow; signal: AbortSignal },
): Promise<void> {
  const handler =
    input.job.handler_name && Object.hasOwn(runtime.afterCommitHandlers, input.job.handler_name)
      ? runtime.afterCommitHandlers[input.job.handler_name]
      : undefined;
  if (typeof handler !== 'function' || !input.job.document_id || !input.job.version_id)
    fail('invalid_input');
  const documentId = input.job.document_id;
  const revisionId = input.job.version_id;
  await securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    signal: input.signal,
    async work(tx) {
      await fenceJob(tx, input.job);
      const state = await jobState(tx, {
        runtime,
        job: input.job,
        operationId: input.job.source_operation,
      });
      await ensureVisible(state, { runtime, id: documentId });
      await runtime.store.readRevision(tx, {
        collection: state.collection.key,
        documentId,
        versionId: revisionId,
      });
    },
  });
  const signal = AbortSignal.any([
    input.signal,
    AbortSignal.timeout(Math.min(runtime.policy.requestTimeoutMs, runtime.workPolicy.jobLeaseMs)),
  ]);
  await boundedHandler(
    handler({
      id: input.job.id,
      collection: input.job.collection_key,
      documentId,
      revisionId,
      signal,
    }),
    signal,
  );
  await runtime.database.transaction((tx) =>
    completeJob(tx, { job: input.job, status: 'succeeded', revisionId }),
  );
}

async function boundedHandler(task: Promise<void>, signal: AbortSignal): Promise<void> {
  let rejectAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(new CmsError('temporarily_unavailable'));
    if (signal.aborted) rejectAbort();
    else signal.addEventListener('abort', rejectAbort, { once: true });
  });
  try {
    await Promise.race([task, aborted]);
  } finally {
    if (rejectAbort) signal.removeEventListener('abort', rejectAbort);
  }
}

async function requeueProgress(runtime: ContentRuntime, job: JobRow): Promise<void> {
  await runtime.database.transaction(async (tx) => {
    const queued = await tx.query(
      "SELECT 1 FROM content_jobs WHERE id=$1 AND owner=$2 AND generation=$3 AND status='running' AND lease_until>clock_timestamp() FOR UPDATE",
      [job.id, job.owner, job.generation],
    );
    if (queued.rowCount !== 1) return;
    await tx.query(
      "UPDATE content_jobs SET status='queued',owner=NULL,lease_until=NULL,attempts=greatest(attempts-1,0),updated_at=clock_timestamp() WHERE id=$1 AND owner=$2 AND generation=$3",
      [job.id, job.owner, job.generation],
    );
  });
}

export async function runClaimedJob(
  runtime: ContentRuntime,
  input: { job: JobRow; signal: AbortSignal },
): Promise<void> {
  try {
    if (input.job.action === 'extension') return await runExtension(runtime, input);
    const pending = await queuedItems(runtime.database, input.job.id);
    for (const item of pending.slice(0, runtime.workPolicy.jobBatchSize)) {
      input.signal.throwIfAborted();
      await executeJobItem(runtime, { job: input.job, item, signal: input.signal });
    }
    await requeueProgress(runtime, input.job);
  } catch (error) {
    if (input.signal.aborted) return;
    try {
      await failJob(runtime, { job: input.job, error });
    } catch {
      return;
    }
  }
}

async function pruneIdleVersions(
  runtime: ContentRuntime,
  input: { cursor: string; signal: AbortSignal },
): Promise<string> {
  let { cursor } = input;
  const result = await runtime.database.query<{ id: string; collection_id: string }>(
    'SELECT id,collection_id FROM content_documents WHERE id>$1 ORDER BY id LIMIT $2',
    [cursor, runtime.workPolicy.jobBatchSize],
  );
  if (result.rows.length === 0) cursor = '00000000-0000-0000-0000-000000000000';
  for (const row of result.rows) {
    input.signal.throwIfAborted();
    const collection = runtime.registry.list.find((item) => item.id === row.collection_id);
    if (collection)
      await securityTransaction(runtime.database, runtime.policy, {
        mode: 'shared',
        signal: input.signal,
        async work(tx) {
          const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
          await lockContentMutation(executor, runtime);
          await runtime.store.lockDocuments(executor, { ids: [row.id] });
          const removed = await pruneDocumentVersions(
            { tx: executor, collection },
            { runtime, documentId: row.id },
          );
          if (removed > 0)
            await appendAudit(
              executor,
              {
                actorKind: 'system',
                operationId: 'content.pruneVersions',
                targetType: `content:${collection.key}`,
                targetId: row.id,
                requestId: randomUUID(),
                detail: { removed },
              },
              runtime.policy,
            );
        },
      });
    cursor = row.id;
  }
  return cursor;
}

export function createContentMaintenance(runtime: ContentRuntime) {
  const owner = randomUUID();
  let cursor = '00000000-0000-0000-0000-000000000000';
  const controller = new AbortController();
  let running: Promise<void> | undefined;
  async function tick() {
    for (let count = 0; count < runtime.workPolicy.jobBatchSize; count += 1) {
      if (controller.signal.aborted) return;
      const [job] = await claimJobs(runtime, owner);
      if (!job) break;
      await runClaimedJob(runtime, { job, signal: controller.signal });
    }
    if (!controller.signal.aborted)
      cursor = await pruneIdleVersions(runtime, { cursor, signal: controller.signal });
    if (!controller.signal.aborted) await prunePreviewGrants(runtime, controller.signal);
  }
  return {
    maintenance() {
      if (controller.signal.aborted) return Promise.resolve();
      running ??= tick().finally(() => {
        running = undefined;
      });
      return running;
    },
    stop() {
      controller.abort();
    },
    async close() {
      controller.abort();
      await running;
    },
  };
}
