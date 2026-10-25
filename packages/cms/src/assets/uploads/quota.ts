import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetLimits } from '../types.ts';

export async function assertUploadCapacity(
  tx: SqlExecutor,
  input: { actorId: string; bytes: number; limits: AssetLimits },
): Promise<void> {
  const result = await tx.query<{
    total: number;
    actorTotal: number;
    bytes: number;
    actorBytes: number;
  }>(
    `SELECT count(*)::int AS total,count(*) FILTER(WHERE actor_id=$1)::int AS "actorTotal",
     COALESCE(sum(declared_bytes),0)::float8 AS bytes,COALESCE(sum(declared_bytes) FILTER(WHERE actor_id=$1),0)::float8 AS "actorBytes"
     FROM asset_uploads WHERE status IN('pending','uploading','processing','ready') AND expires_at>clock_timestamp()`,
    [input.actorId],
  );
  const [current] = result.rows;
  if (!current) fail('temporarily_unavailable');
  if (
    current.total >= input.limits.maxActiveSessions ||
    current.actorTotal >= input.limits.maxActiveSessionsPerActor
  )
    fail('capacity_exceeded');
  if (
    input.bytes > input.limits.maxActiveBytes - current.bytes ||
    input.bytes > input.limits.maxActiveBytesPerActor - current.actorBytes
  )
    fail('capacity_exceeded');
}
