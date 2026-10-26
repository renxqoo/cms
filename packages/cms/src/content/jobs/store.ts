import { randomUUID } from 'node:crypto';
import type { SqlExecutor } from '@new-cms/database/client';
import { fail } from '@new-cms/cms/platform/contracts';
import type { ErrorCode } from '@new-cms/cms/platform/contracts';
import type { ContentRuntime, ContentState } from '../types.ts';
import type { DocumentData } from '../definition.ts';

export interface JobRow {
  id: string;
  collection_id: string;
  collection_key: string;
  action: 'batch' | 'publication' | 'extension';
  actor_id: string;
  document_id: string | null;
  expected_revision: number | null;
  version_id: string | null;
  handler_name: string | null;
  source_operation: string;
  requested_version_id: string | null;
  result_revision_id: string | null;
  execute_at: Date;
  status: 'queued' | 'running' | 'succeeded' | 'partial' | 'failed' | 'cancelled';
  owner: string | null;
  generation: number;
  lease_until: Date | null;
  attempts: number;
  failure_code: ErrorCode | null;
  created_at: Date;
  finished_at: Date | null;
}

export interface JobPayload {
  action: 'update' | 'copy' | 'archive' | 'restoreTrash' | 'publish' | 'unpublish';
  locale: string;
  data?: DocumentData;
  dataByLocale?: Record<string, DocumentData>;
}

export interface JobItemRow {
  job_id: string;
  position: number;
  document_id: string;
  expected_revision: number;
  payload: JobPayload;
  status: 'queued' | 'succeeded' | 'failed' | 'cancelled';
  result_document_id: string | null;
  result_revision_id: string | null;
  error_code: ErrorCode | null;
}

export async function insertJob(
  state: ContentState,
  input: {
    runtime: ContentRuntime;
    action: JobRow['action'];
    executeAt?: string;
    documentId?: string;
    revision?: number;
    versionId?: string;
    handlerName?: string;
    sourceOperation: string;
  },
): Promise<string> {
  const id = randomUUID();
  await state.tx.query(
    `INSERT INTO content_jobs(id,collection_id,collection_key,action,actor_id,document_id,expected_revision,version_id,handler_name,source_operation,requested_version_id,execute_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$8,coalesce($11::timestamptz,clock_timestamp()))`,
    [
      id,
      state.collection.id,
      state.collection.key,
      input.action,
      state.actor.id,
      input.documentId ?? null,
      input.revision ?? null,
      input.versionId ?? null,
      input.handlerName ?? null,
      input.sourceOperation,
      input.executeAt ?? null,
    ],
  );
  return id;
}

export async function readJob(
  tx: SqlExecutor,
  input: { id: string; collectionId: string; lock?: boolean },
): Promise<JobRow> {
  const result = await tx.query<JobRow>(
    `SELECT * FROM content_jobs WHERE id=$1 AND collection_id=$2${input.lock ? ' FOR UPDATE' : ''}`,
    [input.id, input.collectionId],
  );
  const [job] = result.rows;
  if (!job) fail('not_found');
  return job;
}

export async function claimJobs(runtime: ContentRuntime, owner: string): Promise<JobRow[]> {
  return runtime.database.transaction(async (tx) => {
    const exhausted = await tx.query<{ id: string }>(
      "UPDATE content_jobs SET status='failed',failure_code='temporarily_unavailable',owner=NULL,lease_until=NULL,version_id=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id IN(SELECT id FROM content_jobs WHERE (status='queued' OR (status='running' AND lease_until<=clock_timestamp())) AND attempts>=$1 ORDER BY execute_at,id LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING id",
      [runtime.workPolicy.jobMaxAttempts, runtime.workPolicy.jobBatchSize],
    );
    if (exhausted.rows.length > 0)
      await tx.query(
        "UPDATE content_job_items SET status='failed',error_code='temporarily_unavailable' WHERE job_id=ANY($1::uuid[]) AND status='queued'",
        [exhausted.rows.map((row) => row.id)],
      );
    const result = await tx.query<JobRow>(
      `UPDATE content_jobs SET status='running',owner=$1,generation=generation+1,attempts=attempts+1,lease_until=clock_timestamp()+$2*interval '1 millisecond',updated_at=clock_timestamp() WHERE id IN(SELECT id FROM content_jobs WHERE execute_at<=clock_timestamp() AND (status='queued' OR (status='running' AND lease_until<=clock_timestamp())) AND attempts<$3 ORDER BY execute_at,id LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *`,
      [owner, runtime.workPolicy.jobLeaseMs, runtime.workPolicy.jobMaxAttempts],
    );
    return result.rows;
  });
}

export async function fenceJob(tx: SqlExecutor, job: JobRow): Promise<void> {
  const current = await tx.query(
    "SELECT id FROM content_jobs WHERE id=$1 AND owner=$2 AND generation=$3 AND lease_until>clock_timestamp() AND status='running' FOR UPDATE",
    [job.id, job.owner, job.generation],
  );
  if (current.rowCount !== 1) fail('version_conflict');
}

export async function renewJobLease(
  tx: SqlExecutor,
  input: { job: JobRow; leaseMs: number },
): Promise<void> {
  const result = await tx.query(
    "UPDATE content_jobs SET lease_until=clock_timestamp()+$4*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1 AND owner=$2 AND generation=$3 AND lease_until>clock_timestamp() AND status='running' RETURNING id",
    [input.job.id, input.job.owner, input.job.generation, input.leaseMs],
  );
  if (result.rowCount !== 1) fail('version_conflict');
}

export async function queuedItems(tx: SqlExecutor, jobId: string): Promise<JobItemRow[]> {
  const result = await tx.query<JobItemRow>(
    "SELECT * FROM content_job_items WHERE job_id=$1 AND status='queued' ORDER BY position",
    [jobId],
  );
  return result.rows;
}

export async function completeJob(
  tx: SqlExecutor,
  input: {
    job: JobRow;
    status: 'succeeded' | 'partial' | 'failed' | 'cancelled';
    failureCode?: ErrorCode;
    revisionId?: string;
  },
): Promise<void> {
  await fenceJob(tx, input.job);
  if (input.status === 'failed')
    await tx.query(
      "UPDATE content_job_items SET status='failed',error_code=$2 WHERE job_id=$1 AND status='queued'",
      [input.job.id, input.failureCode ?? 'temporarily_unavailable'],
    );
  if (input.status === 'cancelled')
    await tx.query(
      "UPDATE content_job_items SET status='cancelled' WHERE job_id=$1 AND status='queued'",
      [input.job.id],
    );
  await tx.query(
    'UPDATE content_jobs SET status=$4,failure_code=$5,result_revision_id=$6,owner=NULL,lease_until=NULL,version_id=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1 AND owner=$2 AND generation=$3',
    [
      input.job.id,
      input.job.owner,
      input.job.generation,
      input.status,
      input.failureCode ?? null,
      input.revisionId ?? null,
    ],
  );
}

export async function finalizeBatch(tx: SqlExecutor, job: JobRow): Promise<void> {
  const count = await tx.query<{ pending: string; succeeded: string; failed: string }>(
    "SELECT count(*) FILTER(WHERE status='queued') AS pending,count(*) FILTER(WHERE status='succeeded') AS succeeded,count(*) FILTER(WHERE status='failed') AS failed FROM content_job_items WHERE job_id=$1",
    [job.id],
  );
  const [row] = count.rows;
  if (!row || Number(row.pending) > 0) return;
  const failed = Number(row.failed);
  let status: 'succeeded' | 'partial' | 'failed' = 'succeeded';
  if (failed > 0) status = Number(row.succeeded) > 0 ? 'partial' : 'failed';
  await completeJob(tx, { job, status });
}
