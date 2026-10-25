import { assetTransaction } from '../runtime.ts';
import type { AssetsOptions } from '../types.ts';
import { failureCode } from '../validation.ts';
import { claimJob } from '../processing/claim-job.ts';
import { buildCandidates } from '../processing/build-candidates.ts';
import { finishJob } from '../processing/finish-job.ts';
import type { ClaimedJob } from '../processing/types.ts';

async function failJob(
  runtime: AssetsOptions,
  input: { claimed: ClaimedJob; error: unknown },
): Promise<void> {
  const { job } = input.claimed;
  const code = failureCode(input.error);
  const retry = code === 'temporarily_unavailable' && job.attempts < runtime.limits.jobAttempts;
  await assetTransaction(runtime, async (tx) => {
    const updated = await tx.query(
      `UPDATE asset_jobs SET status=$4,failure_code=$5,lease_until=NULL,finished_at=CASE WHEN $4='failed' THEN clock_timestamp() ELSE NULL END,
       next_run_at=clock_timestamp()+$6*interval '1 millisecond' WHERE id=$1 AND owner=$2 AND generation=$3 AND status='running' RETURNING upload_id`,
      [
        job.id,
        job.owner,
        job.generation,
        retry ? 'queued' : 'failed',
        code,
        runtime.limits.leaseMs,
      ],
    );
    if (updated.rowCount !== 1) return;
    if (!retry)
      await tx.query(
        "UPDATE asset_uploads SET status='failed',failure_code=$2 WHERE id=$1 AND status='processing'",
        [job.upload_id, code],
      );
    await tx.query('DELETE FROM asset_job_objects WHERE job_id=$1 AND generation=$2', [
      job.id,
      job.generation,
    ]);
  });
}

async function processNext(runtime: AssetsOptions, signal: AbortSignal): Promise<boolean> {
  const claimed = await claimJob(runtime);
  if (!claimed) return false;
  const workSignal = AbortSignal.any([
    signal,
    AbortSignal.timeout(runtime.limits.processingTimeoutMs),
  ]);
  try {
    const built = await buildCandidates(runtime, { claimed, signal: workSignal });
    await finishJob(runtime, { claimed, ...built, signal: workSignal });
  } catch (error) {
    await failJob(runtime, { claimed, error });
  }
  return true;
}

export async function processJobs(runtime: AssetsOptions, signal: AbortSignal): Promise<number> {
  let count = 0;
  while (count < runtime.limits.maintenanceBatchSize && !signal.aborted) {
    if (!(await processNext(runtime, signal))) break;
    count += 1;
  }
  return count;
}
