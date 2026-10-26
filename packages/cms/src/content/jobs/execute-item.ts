import { randomUUID } from 'node:crypto';
import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { ErrorCode } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import {
  budgetedExecutor,
  collectionPredicate,
  ensureVisible,
  resolveLocale,
  lockContentMutation,
} from '../runtime.ts';
import { saveInTransaction } from '../documents/save-document.ts';
import { copyInTransaction } from '../documents/copy-document.ts';
import { archiveInTransaction } from '../documents/archive-document.ts';
import { restoreTrashInTransaction } from '../documents/restore-trash.ts';
import { publishInTransaction, unpublishInTransaction } from '../documents/publish-document.ts';
import { completeJob, fenceJob, finalizeBatch, renewJobLease } from './store.ts';
import type { JobItemRow, JobRow } from './store.ts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { SqlExecutor } from '@new-cms/database/client';

export function jobError(error: unknown): ErrorCode {
  if (error instanceof CmsError) return error.code;
  if (error !== null && typeof error === 'object' && 'code' in error) {
    if (error.code === '23505') return 'identifier_taken';
    if (error.code === '23503') return 'resource_in_use';
    if (error.code === '23502' || error.code === '23514') return 'invalid_input';
  }
  return 'temporarily_unavailable';
}

export function itemOperation(action: JobItemRow['payload']['action']): string {
  const operations = {
    update: 'documents.update',
    copy: 'documents.copy',
    archive: 'documents.archive',
    restoreTrash: 'documents.restoreTrash',
    publish: 'documents.publish',
    unpublish: 'documents.unpublish',
  };
  return operations[action];
}

export async function jobState(
  tx: SqlExecutor,
  input: { runtime: ContentRuntime; job: JobRow; operationId: string; locale?: string },
): Promise<ContentState> {
  const scope = { scopeKind: 'collection' as const, collectionKey: input.job.collection_key };
  const actor = await input.runtime.authorizeActor(tx, {
    actorId: input.job.actor_id,
    operationId: input.job.source_operation,
    scope,
  });
  const collection = input.runtime.registry.get(input.job.collection_key);
  const base = {
    tx,
    actor,
    collection,
    ctx: { requestId: randomUUID(), ip: 'internal' },
    operationId: input.job.source_operation,
    locale: resolveLocale(collection, input.locale),
    mode: 'editing' as const,
    actorAuthorization: true,
  };
  const original = collectionPredicate(base);
  await input.runtime.authorizeActor(tx, {
    actorId: actor.id,
    operationId: input.operationId,
    scope,
  });
  const state = { ...base, operationId: input.operationId };
  const target = collectionPredicate(state);
  const predicates = [original, target].filter((predicate) => predicate !== undefined);
  return { ...state, ...(predicates.length > 0 ? { predicate: { and: predicates } } : {}) };
}

async function performItem(
  state: ContentState,
  input: { runtime: ContentRuntime; job: JobRow; item: JobItemRow },
): Promise<{ id: string; versionId: string }> {
  const values = {
    collection: state.collection.key,
    id: input.item.document_id,
    revision: input.item.expected_revision,
    ...(input.item.payload.data ? { data: input.item.payload.data } : {}),
    ...(input.item.payload.dataByLocale ? { dataByLocale: input.item.payload.dataByLocale } : {}),
  };
  if (input.job.action === 'publication') {
    if (!input.job.version_id) fail('invalid_input');
    const publication = {
      runtime: input.runtime,
      id: values.id,
      revision: values.revision,
      versionId: input.job.version_id,
    };
    return input.item.payload.action === 'unpublish'
      ? unpublishInTransaction(state, publication)
      : publishInTransaction(state, publication);
  }
  switch (input.item.payload.action) {
    case 'update':
      if (!values.data && !values.dataByLocale) fail('invalid_input');
      return saveInTransaction(state, { runtime: input.runtime, values, kind: 'batchUpdated' });
    case 'copy':
      return copyInTransaction(state, { runtime: input.runtime, values });
    case 'archive':
      return archiveInTransaction(state, {
        runtime: input.runtime,
        id: values.id,
        revision: values.revision,
      });
    case 'restoreTrash':
      return restoreTrashInTransaction(state, {
        runtime: input.runtime,
        id: values.id,
        revision: values.revision,
      });
    case 'publish':
    case 'unpublish':
      break;
  }
  return fail('invalid_input');
}

async function executeFenced(
  tx: SqlExecutor,
  input: { runtime: ContentRuntime; job: JobRow; item: JobItemRow },
): Promise<void> {
  await renewJobLease(tx, { job: input.job, leaseMs: input.runtime.workPolicy.jobLeaseMs });
  await tx.query('SAVEPOINT content_item');
  try {
    const operationId = itemOperation(input.item.payload.action);
    const state = await jobState(tx, {
      runtime: input.runtime,
      job: input.job,
      operationId,
      locale: input.item.payload.locale,
    });
    await ensureVisible(state, {
      runtime: input.runtime,
      id: input.item.document_id,
      trashed:
        input.item.payload.action === 'restoreTrash' || input.item.payload.action === 'archive',
    });
    const reference = await performItem(state, input);
    await fenceJob(tx, input.job);
    await tx.query(
      "UPDATE content_job_items SET status='succeeded',result_document_id=$3,result_revision_id=$4 WHERE job_id=$1 AND position=$2 AND status='queued'",
      [input.job.id, input.item.position, reference.id, reference.versionId],
    );
    await tx.query('RELEASE SAVEPOINT content_item');
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT content_item');
    await fenceJob(tx, input.job);
    await tx.query(
      "UPDATE content_job_items SET status='failed',error_code=$3 WHERE job_id=$1 AND position=$2 AND status='queued'",
      [input.job.id, input.item.position, jobError(error)],
    );
  }
  await finalizeBatch(tx, input.job);
}

export function executeJobItem(
  runtime: ContentRuntime,
  input: { job: JobRow; item: JobItemRow; signal?: AbortSignal },
): Promise<void> {
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    signal: AbortSignal.any([
      AbortSignal.timeout(Math.min(runtime.policy.requestTimeoutMs, runtime.workPolicy.jobLeaseMs)),
      ...(input.signal ? [input.signal] : []),
    ]),
    async work(tx) {
      const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
      await lockContentMutation(executor, runtime);
      return executeFenced(executor, { runtime, job: input.job, item: input.item });
    },
  });
}

export function failJob(
  runtime: ContentRuntime,
  input: { job: JobRow; error: unknown },
): Promise<void> {
  return runtime.database.transaction((tx) =>
    completeJob(tx, { job: input.job, status: 'failed', failureCode: jobError(input.error) }),
  );
}
