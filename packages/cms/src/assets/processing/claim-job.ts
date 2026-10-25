import { assetTransaction } from '../runtime.ts';
import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetsOptions, UploadRow } from '../types.ts';
import type { ClaimedJob, JobRow, ObjectRow } from './types.ts';

export async function requireLease(tx: SqlExecutor, job: JobRow): Promise<void> {
  const result = await tx.query(
    `SELECT id FROM asset_jobs WHERE id=$1 AND status='running' AND owner=$2 AND generation=$3 AND lease_until>clock_timestamp() FOR UPDATE`,
    [job.id, job.owner, job.generation],
  );
  if (result.rowCount !== 1) fail('version_conflict');
}

export async function claimJob(runtime: AssetsOptions): Promise<ClaimedJob | null> {
  return assetTransaction(runtime, async (tx) => {
    const result = await tx.query<JobRow>(
      `SELECT * FROM asset_jobs WHERE (status='queued' AND next_run_at<=clock_timestamp()) OR
       (status='running' AND lease_until<=clock_timestamp()) ORDER BY next_run_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`,
    );
    const [job] = result.rows;
    if (!job) return null;
    const uploads = await tx.query<UploadRow>(
      'SELECT *,declared_bytes::float8 AS declared_bytes,expires_at>clock_timestamp() AS is_active,lease_until>clock_timestamp() AS lease_active FROM asset_uploads WHERE id=$1',
      [job.upload_id],
    );
    const [upload] = uploads.rows;
    if (
      !upload?.original_object_id ||
      upload.status !== 'processing' ||
      !upload.is_active ||
      job.attempts >= runtime.limits.jobAttempts
    ) {
      await rejectUnclaimable(tx, { job, upload });
      return null;
    }
    const objects = await tx.query<ObjectRow>(
      "SELECT *,bytes::float8 AS bytes FROM asset_objects WHERE id=$1 AND state='ready' FOR UPDATE",
      [upload.original_object_id],
    );
    const [original] = objects.rows;
    if (!original) fail('not_found');
    const owner = randomUUID();
    const claimed = await tx.query<JobRow>(
      `UPDATE asset_jobs SET status='running',owner=$2,generation=generation+1,attempts=attempts+1,lease_until=clock_timestamp()+$3*interval '1 millisecond'
       WHERE id=$1 RETURNING *`,
      [job.id, owner, runtime.limits.leaseMs],
    );
    const [current] = claimed.rows;
    if (!current) fail('not_found');
    await tx.query('INSERT INTO asset_job_objects(job_id,generation,object_id) VALUES($1,$2,$3)', [
      job.id,
      current.generation,
      original.id,
    ]);
    return { job: current, upload, original };
  });
}

async function rejectUnclaimable(
  tx: SqlExecutor,
  input: { job: JobRow; upload: UploadRow | undefined },
): Promise<void> {
  const { job, upload } = input;
  const code = upload && !upload.is_active ? 'invalid_input' : 'capacity_exceeded';
  await tx.query(
    "UPDATE asset_jobs SET status='failed',failure_code=$2,finished_at=clock_timestamp() WHERE id=$1",
    [job.id, code],
  );
  await tx.query(
    "UPDATE asset_uploads SET status=$2,failure_code=$3 WHERE id=$1 AND status='processing'",
    [job.upload_id, upload && !upload.is_active ? 'expired' : 'failed', code],
  );
}
