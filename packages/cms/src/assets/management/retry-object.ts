import type { SqlExecutor } from '@new-cms/database/client';

export function resetBlockedObjects(tx: SqlExecutor, input: { id?: string; limit: number }) {
  return tx.query<{ id: string }>(
    `UPDATE asset_objects SET cleanup_generation=cleanup_generation+1,cleanup_attempts=0,cleanup_blocked=false,cleanup_failure_code=NULL,
      next_cleanup_at=GREATEST(coalesce(next_cleanup_at,clock_timestamp()),clock_timestamp())
     WHERE id IN(SELECT id FROM asset_objects WHERE cleanup_blocked AND ($1::uuid IS NULL OR id=$1)
     ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED) RETURNING id`,
    [input.id ?? null, input.limit],
  );
}
