import type { Database } from '@new-cms/database/client';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';
import { cleanupIdempotency } from '@new-cms/cms/platform/idempotency';
import { cleanupRateLimits } from '@new-cms/cms/platform/rate-limits';
import { maintainDelegations } from './delegations/maintenance.ts';

export async function maintainIdentity(database: Database, policy: CmsPolicy): Promise<void> {
  await database.transaction(async (tx) => {
    const locked = await tx.query<{ acquired: boolean }>(
      'SELECT pg_try_advisory_xact_lock($1::bigint) AS acquired',
      [policy.maintenanceLockKey],
    );
    if (!locked.rows[0]?.acquired) return;
    await tx.query(
      `UPDATE email_deliveries SET status='unknown',finished_at=clock_timestamp(),
      failure_code='interrupted',updated_at=clock_timestamp() WHERE status IN ('pending','sending') AND id IN (
      SELECT id FROM email_deliveries WHERE status IN ('pending','sending')
      AND created_at<clock_timestamp()-$1*interval '1 millisecond' ORDER BY created_at,id LIMIT $2)`,
      [policy.deliveryStaleMs, policy.cleanupBatchSize],
    );
    await cleanExpired(tx, policy);
    await maintainDelegations(tx, policy);
    await cleanupIdempotency(tx, policy.cleanupBatchSize);
    await cleanupRateLimits(tx, policy.cleanupBatchSize);
  });
}

async function cleanExpired(tx: Pick<Database, 'query'>, policy: CmsPolicy): Promise<void> {
  const expired = await tx.query<{ id: string }>(
    `SELECT id FROM action_tokens
    WHERE least(expires_at,coalesce(consumed_at,expires_at),coalesce(revoked_at,expires_at))
    <clock_timestamp()-$1*interval '1 millisecond' ORDER BY expires_at,id LIMIT $2`,
    [policy.retentionMs, policy.cleanupBatchSize],
  );
  const ids = expired.rows.map((row) => row.id);
  if (ids.length > 0) {
    await tx.query('DELETE FROM email_deliveries WHERE action_token_id=ANY($1::uuid[])', [ids]);
    await tx.query('DELETE FROM action_tokens WHERE id=ANY($1::uuid[])', [ids]);
  }
  await tx.query(
    `DELETE FROM sessions WHERE id IN (SELECT id FROM sessions
    WHERE least(expires_at,coalesce(revoked_at,expires_at))<clock_timestamp()-$1*interval '1 millisecond'
    ORDER BY expires_at,id LIMIT $2)`,
    [policy.retentionMs, policy.cleanupBatchSize],
  );
}
