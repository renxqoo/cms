import { assertBatchOperation, assertDocumentOperation } from '../lifecycle/operation-controls.ts';
import { randomUUID } from 'node:crypto';
import { actorReference } from '@new-cms/cms/access';
import { runOperationHooks } from '../hooks/api.ts';
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

interface JobStateInput {
  runtime: ContentRuntime;
  job: JobRow;
  operationId: string;
  locale?: string;
  signal?: AbortSignal;
}
async function jobCollection(tx: SqlExecutor, input: JobStateInput) {
  const collection = await input.runtime.resolveCollection(tx, input.job.collection_key);
  if (input.job.action === 'publication')
    assertDocumentOperation(collection, 'content.schedulePublication');
  if (input.job.action === 'batch') assertBatchOperation(collection, input.operationId);
  if (input.job.action === 'extension' && !input.job.source_locale) fail('invalid_input');
  return collection;
}
export async function jobState(tx: SqlExecutor, input: JobStateInput): Promise<ContentState> {
  const scope = { scopeKind: 'collection' as const, collectionKey: input.job.collection_key };
  const actor = await input.runtime.authorizeActor(tx, {
    actor: { id: input.job.actor_id, delegationId: input.job.delegation_id },
    operationId: input.job.source_operation,
    scope,
  });
  const collection = await jobCollection(tx, input);
  const base = {
    hookBudget: { used: 0 },
    hookLimits: input.runtime.limits,
    tx,
    actor,
    collection,
    ctx: {
      requestId: randomUUID(),
      ip: 'internal',
      ...(input.signal ? { signal: input.signal } : {}),
    },
    operationId: input.job.source_operation,
    locale: resolveLocale(
      collection,
      input.job.action === 'extension' ? (input.job.source_locale ?? undefined) : input.locale,
    ),
    mode: 'editing' as const,
    actorAuthorization: true,
    backgroundWork: true,
  };
  const original = await collectionPredicate(base);
  await input.runtime.authorizeActor(tx, {
    actor: actorReference(actor),
    operationId: input.operationId,
    scope,
  });
  const state = { ...base, operationId: input.operationId };
  const target = await collectionPredicate(state);
  const predicates = [original, target].filter((predicate) => predicate !== undefined);
  return { ...state, ...(predicates.length > 0 ? { predicate: { and: predicates } } : {}) };
}

async function performPublication(
  state: ContentState,
  input: { runtime: ContentRuntime; job: JobRow; item: JobItemRow },
) {
  if (!input.job.version_id) fail('invalid_input');
  if (input.item.payload.action !== 'publish' && input.item.payload.action !== 'unpublish')
    fail('invalid_input');
  const transition =
    input.item.payload.action === 'unpublish' ? unpublishInTransaction : publishInTransaction;
  return transition(state, {
    runtime: input.runtime,
    id: input.item.document_id,
    revision: input.item.expected_revision,
    versionId: input.job.version_id,
  });
}

async function performItem(
  state: ContentState,
  input: { runtime: ContentRuntime; job: JobRow; item: JobItemRow; signal?: AbortSignal },
): Promise<{ id: string; versionId: string }> {
  const values = {
    collection: state.collection.key,
    id: input.item.document_id,
    revision: input.item.expected_revision,
    ...(input.item.payload.data ? { data: input.item.payload.data } : {}),
    ...(input.item.payload.dataByLocale ? { dataByLocale: input.item.payload.dataByLocale } : {}),
  };
  if (input.job.action === 'publication') return performPublication(state, input);
  switch (input.item.payload.action) {
    case 'publish':
    case 'unpublish':
      return fail('invalid_input');
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
  }
  return fail('invalid_input');
}

async function performOperation(
  state: ContentState,
  input: { runtime: ContentRuntime; job: JobRow; item: JobItemRow; signal?: AbortSignal },
): Promise<{ id: string; versionId: string }> {
  return runOperationHooks(state, {
    limits: input.runtime.limits,
    async work() {
      const reference = await performItem(state, input);
      await input.runtime.validateAfterMutation?.(state.tx, {
        collection: state.collection.key,
        operationId: state.operationId,
      });
      return reference;
    },
  });
}

async function executeFenced(
  tx: SqlExecutor,
  input: { runtime: ContentRuntime; job: JobRow; item: JobItemRow; signal?: AbortSignal },
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
      ...(input.signal ? { signal: input.signal } : {}),
    });
    await ensureVisible(state, {
      runtime: input.runtime,
      id: input.item.document_id,
      trashed:
        input.item.payload.action === 'restoreTrash' || input.item.payload.action === 'archive',
    });
    const reference = await performOperation(state, input);
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
  const signal = AbortSignal.any([
    AbortSignal.timeout(Math.min(runtime.policy.requestTimeoutMs, runtime.workPolicy.jobLeaseMs)),
    ...(input.signal ? [input.signal] : []),
  ]);
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    signal,
    async work(tx) {
      const executor = budgetedExecutor(tx, runtime.limits.maxSqlQueries);
      await lockContentMutation(executor, runtime);
      return executeFenced(executor, { runtime, job: input.job, item: input.item, signal });
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
