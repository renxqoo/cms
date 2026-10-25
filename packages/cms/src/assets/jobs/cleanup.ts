import { assetTransaction } from '../runtime.ts';
import type { AssetsOptions } from '../types.ts';
import { failureCode } from '../validation.ts';

async function expire(runtime: AssetsOptions): Promise<void> {
  await assetTransaction(runtime, async (tx) => {
    await tx.query(
      `UPDATE asset_jobs SET status='cancelled',generation=generation+1,finished_at=clock_timestamp()
       WHERE id IN(SELECT j.id FROM asset_jobs j JOIN asset_uploads u ON u.id=j.upload_id
       WHERE u.expires_at<=clock_timestamp() AND j.status IN('queued','running') ORDER BY j.id LIMIT $1 FOR UPDATE OF j SKIP LOCKED)`,
      [runtime.limits.maintenanceBatchSize],
    );
    await tx.query(
      `UPDATE asset_uploads SET status='expired',generation=generation+1 WHERE id IN(
       SELECT id FROM asset_uploads WHERE expires_at<=clock_timestamp() AND status IN('pending','uploading','processing','ready') ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)`,
      [runtime.limits.maintenanceBatchSize],
    );
    await tx.query(
      `UPDATE asset_uploads SET status='failed',failure_code='temporarily_unavailable',lease_until=NULL WHERE id IN(
       SELECT id FROM asset_uploads WHERE status='uploading' AND lease_until<=clock_timestamp() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)`,
      [runtime.limits.maintenanceBatchSize],
    );
    await tx.query(
      `DELETE FROM asset_job_objects WHERE(job_id,generation,object_id) IN(
       SELECT p.job_id,p.generation,p.object_id FROM asset_job_objects p JOIN asset_jobs j ON p.job_id=j.id
       WHERE j.status IN('succeeded','failed','cancelled') OR p.generation<>j.generation
       ORDER BY p.job_id,p.generation,p.object_id LIMIT $1 FOR UPDATE OF p SKIP LOCKED)`,
      [runtime.limits.maintenanceBatchSize],
    );
  });
}

async function retireManifests(runtime: AssetsOptions): Promise<void> {
  await assetTransaction(runtime, async (tx) => {
    const rows = await tx.query<{ id: string }>(
      `SELECT m.id FROM asset_manifests m WHERE m.state='ready' AND m.retain_until<=clock_timestamp()
       AND NOT EXISTS(SELECT 1 FROM asset_references r WHERE r.manifest_id=m.id)
       AND NOT EXISTS(SELECT 1 FROM asset_uploads u WHERE u.manifest_id=m.id AND u.status IN('ready','processing'))
       ORDER BY m.id LIMIT $1 FOR UPDATE OF m SKIP LOCKED`,
      [runtime.limits.maintenanceBatchSize],
    );
    for (const row of rows.rows) {
      await tx.query("UPDATE asset_manifests SET state='deleted' WHERE id=$1", [row.id]);
      await tx.query('DELETE FROM asset_manifest_objects WHERE manifest_id=$1', [row.id]);
    }
  });
}

async function claimObjects(runtime: AssetsOptions) {
  return assetTransaction(runtime, async (tx) => {
    const rows = await tx.query<{ id: string; object_key: string }>(
      `SELECT o.id,o.object_key FROM asset_objects o WHERE o.state IN('pending','ready','deleting')
       AND NOT o.cleanup_blocked AND o.retain_until<=clock_timestamp() AND (o.write_deadline IS NULL OR o.write_deadline+$2*interval '1 millisecond'<=clock_timestamp())
       AND (o.next_cleanup_at IS NULL OR o.next_cleanup_at<=clock_timestamp())
       AND NOT EXISTS(SELECT 1 FROM asset_manifest_objects mo WHERE mo.object_id=o.id)
       AND NOT EXISTS(SELECT 1 FROM asset_job_objects p WHERE p.object_id=o.id)
       AND NOT EXISTS(SELECT 1 FROM asset_uploads u WHERE u.original_object_id=o.id AND u.status IN('pending','uploading','processing','ready'))
       ORDER BY o.id LIMIT $1 FOR UPDATE OF o SKIP LOCKED`,
      [runtime.limits.maintenanceBatchSize, runtime.storage.capabilities.writeSettleMs ?? 0],
    );
    for (const row of rows.rows)
      await tx.query(
        `UPDATE asset_objects SET state='deleting',next_cleanup_at=clock_timestamp()+$2*interval '1 millisecond' WHERE id=$1`,
        [row.id, runtime.limits.leaseMs],
      );
    return rows.rows;
  });
}

export async function cleanupAssets(runtime: AssetsOptions, signal: AbortSignal): Promise<number> {
  await expire(runtime);
  await retireManifests(runtime);
  const objects = await claimObjects(runtime);
  let count = 0;
  for (const object of objects) {
    signal.throwIfAborted();
    try {
      await runtime.storage.remove({ key: object.object_key, signal });
      const state = runtime.storage.capabilities.writeSettleMs === null ? 'deleting' : 'deleted';
      await assetTransaction(runtime, (tx) =>
        tx.query(
          "UPDATE asset_objects SET state=$2,cleanup_attempts=0,cleanup_failure_code=NULL WHERE id=$1 AND state='deleting'",
          [object.id, state],
        ),
      );
      if (state === 'deleted') count += 1;
    } catch (error) {
      await assetTransaction(runtime, (tx) =>
        tx.query(
          `UPDATE asset_objects SET cleanup_attempts=cleanup_attempts+1,cleanup_failure_code=$2,
         cleanup_blocked=(cleanup_attempts+1>=$3) WHERE id=$1 AND state='deleting'`,
          [object.id, failureCode(error), runtime.limits.jobAttempts],
        ),
      );
      process.stderr.write(
        `${JSON.stringify({ event: 'asset_cleanup_failed', objectId: object.id, code: failureCode(error) })}\n`,
      );
    }
  }
  return count;
}

export async function reconcileCleanup(
  runtime: AssetsOptions,
  signal: AbortSignal,
): Promise<{ retried: number; cleaned: number }> {
  const reset = await assetTransaction(runtime, (tx) =>
    tx.query(
      `UPDATE asset_objects SET cleanup_attempts=0,cleanup_blocked=false,cleanup_failure_code=NULL,next_cleanup_at=clock_timestamp()
     WHERE id IN(SELECT id FROM asset_objects WHERE cleanup_blocked ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED)`,
      [runtime.limits.maintenanceBatchSize],
    ),
  );
  return { retried: reset.rowCount ?? 0, cleaned: await cleanupAssets(runtime, signal) };
}
