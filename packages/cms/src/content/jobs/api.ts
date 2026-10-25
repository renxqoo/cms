import { assertAssetJobVisible } from '../adapters/postgres/asset-job-discovery.ts';
import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import {
  auditContent,
  createRunner,
  ensureVisible,
  idempotentReference,
  parse,
  requireAdditionalOperation,
  requireRevision,
} from '../runtime.ts';
import { insertJob, readJob } from './store.ts';
import type { JobRow } from './store.ts';
import { runClaimedJob } from './worker.ts';
import { projectJob } from './query.ts';
import { languageInput } from '../documents/revision-data.ts';
import type { ContentState, ContentRuntime } from '../types.ts';

async function claimSpecific(runtime: ContentRuntime, id: string): Promise<JobRow | undefined> {
  const result = await runtime.database.query<JobRow>(
    "UPDATE content_jobs SET status='running',owner=$2,generation=generation+1,attempts=attempts+1,lease_until=clock_timestamp()+$3*interval '1 millisecond',updated_at=clock_timestamp() WHERE id=$1 AND status='queued' RETURNING *",
    [id, randomUUID(), runtime.workPolicy.jobLeaseMs],
  );
  return result.rows[0];
}

type BatchInput = ReturnType<ContentRuntime['schemas']['content.batch']['parse']>;
type ScheduleInput = ReturnType<ContentRuntime['schemas']['content.schedulePublication']['parse']>;

async function acceptBatch(
  state: ContentState,
  input: { runtime: ContentRuntime; values: BatchInput },
): Promise<{ jobId: string }> {
  const id = await insertJob(state, {
    runtime: input.runtime,
    action: 'batch',
    sourceOperation: 'content.batch',
  });
  const items = input.values.items.map((item, position) => ({
    position,
    document_id: item.id,
    expected_revision: item.revision,
    payload: { action: input.values.action, locale: state.locale, ...languageInput(item) },
  }));
  await state.tx.query(
    'INSERT INTO content_job_items(job_id,position,document_id,expected_revision,payload) SELECT $1,position,document_id,expected_revision,payload FROM jsonb_to_recordset($2::jsonb) AS item(position integer,document_id uuid,expected_revision integer,payload jsonb)',
    [id, JSON.stringify(items)],
  );
  await auditContent(state, {
    runtime: input.runtime,
    id,
    detail: {
      kind: 'batchAccepted',
      count: input.values.items.length,
      action: input.values.action,
    },
  });
  return { jobId: id };
}

async function currentJob(state: ContentState, input: { runtime: ContentRuntime; id: string }) {
  return projectJob(state, {
    runtime: input.runtime,
    job: await readJob(state.tx, { id: input.id, collectionId: state.collection.id }),
  });
}

function acceptedJob(job: Awaited<ReturnType<typeof currentJob>>) {
  return {
    jobId: job.id,
    status: job.status,
    location: `/v1/collections/${job.collection}/jobs/${job.id}`,
  };
}

async function createBatch(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['content.batch'], raw);
  const language = languageInput(input);
  const reference = await createRunner(runtime)(
    {
      ctx,
      operationId: 'content.batch',
      collection: input.collection,
      ...(language.locale ? { locale: language.locale } : {}),
    },
    (state) =>
      idempotentReference(state, { runtime, input }, () =>
        acceptBatch(state, { runtime, values: input }),
      ),
  );
  const synchronous = input.items.length <= runtime.workPolicy.maxSyncBatchItems;
  if (synchronous) {
    const job = await claimSpecific(runtime, reference.jobId);
    if (job)
      await runClaimedJob(runtime, { job, signal: ctx.signal ?? new AbortController().signal });
  }
  return createRunner(runtime)(
    { ctx, operationId: 'content.batch', collection: input.collection },
    async (state) => {
      const job = await currentJob(state, { runtime, id: reference.jobId });
      return synchronous ? job : acceptedJob(job);
    },
  );
}

async function validateSchedule(
  state: ContentState,
  input: { runtime: ContentRuntime; values: ScheduleInput },
): Promise<void> {
  if (state.collection.mode !== 'drafts') fail('invalid_input');
  const document = await ensureVisible(state, {
    runtime: input.runtime,
    id: input.values.id,
    lock: true,
  });
  requireRevision(document, input.values.revision);
  if (document.currentVersionId !== input.values.versionId) fail('version_conflict');
  await requireAdditionalOperation(state, {
    runtime: input.runtime,
    operationId: 'documents.publish',
    id: input.values.id,
  });
  const time = await state.tx.query(
    "SELECT 1 WHERE $1::timestamptz>clock_timestamp() AND $1::timestamptz<=clock_timestamp()+$2*interval '1 millisecond'",
    [input.values.executeAt, input.runtime.workPolicy.maxScheduleDelayMs],
  );
  if (time.rowCount !== 1) fail('invalid_input');
}

async function acceptSchedule(
  state: ContentState,
  input: { runtime: ContentRuntime; values: ScheduleInput },
): Promise<{ jobId: string }> {
  await validateSchedule(state, input);
  const id = await insertJob(state, {
    runtime: input.runtime,
    action: 'publication',
    executeAt: input.values.executeAt,
    documentId: input.values.id,
    revision: input.values.revision,
    versionId: input.values.versionId,
    sourceOperation: 'content.schedulePublication',
  });
  await state.tx.query(
    'INSERT INTO content_job_items(job_id,position,document_id,expected_revision,payload) VALUES($1,0,$2,$3,$4::jsonb)',
    [
      id,
      input.values.id,
      input.values.revision,
      JSON.stringify({ action: 'update', locale: state.locale }),
    ],
  );
  await auditContent(state, {
    runtime: input.runtime,
    id: input.values.id,
    detail: { kind: 'publicationScheduled', jobId: id, versionId: input.values.versionId },
  });
  return { jobId: id };
}

async function schedulePublication(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['content.schedulePublication'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'content.schedulePublication', collection: input.collection },
    async (state) => {
      const reference = await idempotentReference(state, { runtime, input }, () =>
        acceptSchedule(state, { runtime, values: input }),
      );
      return acceptedJob(await currentJob(state, { runtime, id: reference.jobId }));
    },
  );
}

async function cancelSchedule(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['content.cancelPublicationSchedule'], raw);
  return createRunner(runtime)(
    { ctx, operationId: 'content.cancelPublicationSchedule', collection: input.collection },
    async (state) => {
      const job = await readJob(state.tx, {
        id: input.scheduleId,
        collectionId: state.collection.id,
        lock: true,
      });
      if (job.action !== 'publication' || job.document_id !== input.id) fail('not_found');
      await ensureVisible(state, { runtime, id: input.id, trashed: true });
      if (job.status === 'cancelled') return;
      if (job.status !== 'queued' && job.status !== 'running') fail('version_conflict');
      await state.tx.query(
        "UPDATE content_jobs SET status='cancelled',owner=NULL,lease_until=NULL,version_id=NULL,finished_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1",
        [job.id],
      );
      await state.tx.query(
        "UPDATE content_job_items SET status='cancelled' WHERE job_id=$1 AND status='queued'",
        [job.id],
      );
      await auditContent(state, {
        runtime,
        id: input.id,
        detail: { kind: 'publicationScheduleCancelled', jobId: job.id },
      });
    },
  );
}

async function getJob(runtime: ContentRuntime, ctx: RequestContext, raw: unknown) {
  const input = parse(runtime.schemas['content.getJob'], raw);
  const result = await createRunner(runtime)(
    { ctx, operationId: 'content.getJob', collection: input.collection },
    async (state) => {
      const match = await state.tx.query<JobRow>(
        'SELECT * FROM content_jobs WHERE id=$1 AND collection_id=$2',
        [input.jobId, state.collection.id],
      );
      const [job] = match.rows;
      if (job) return projectJob(state, { runtime, job });
      const value = await runtime.readAssetJob(ctx, input, state.tx);
      await assertAssetJobVisible(state, { runtime, id: input.jobId });
      return value;
    },
  );
  return result;
}

export function createJobApi(runtime: ContentRuntime) {
  return {
    createBatch: (ctx: RequestContext, raw: unknown) => createBatch(runtime, ctx, raw),
    schedulePublication: (ctx: RequestContext, raw: unknown) =>
      schedulePublication(runtime, ctx, raw),
    cancelPublicationSchedule: (ctx: RequestContext, raw: unknown) =>
      cancelSchedule(runtime, ctx, raw),
    getJob: (ctx: RequestContext, raw: unknown) => getJob(runtime, ctx, raw),
  };
}
