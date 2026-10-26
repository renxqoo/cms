import type { SqlExecutor } from '@new-cms/database/client';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

export async function maintainDelegations(tx: SqlExecutor, policy: CmsPolicy): Promise<void> {
  const batch = policy.delegation.cleanupBatchSize;
  await tx.query(
    'DELETE FROM credential_tokens WHERE id IN(SELECT t.id FROM credential_tokens t JOIN credential_grants g ON g.id=t.grant_id WHERE t.expires_at<=clock_timestamp() OR g.revoked_at IS NOT NULL OR g.expires_at<=clock_timestamp() ORDER BY t.expires_at,t.id LIMIT $1)',
    [batch],
  );
  await tx.query(
    'DELETE FROM oauth_requests WHERE id IN(SELECT r.id FROM oauth_requests r LEFT JOIN credential_grants g ON g.id=r.grant_id WHERE r.expires_at<=clock_timestamp() AND (r.grant_id IS NULL OR g.revoked_at IS NOT NULL OR g.expires_at<=clock_timestamp()) ORDER BY r.expires_at,r.id LIMIT $1)',
    [batch],
  );
  await cleanGrants(tx, policy);
  await tx.query(
    'DELETE FROM oauth_clients WHERE id IN(SELECT c.id FROM oauth_clients c WHERE c.expires_at<=clock_timestamp() AND NOT EXISTS(SELECT 1 FROM credential_grants g WHERE g.client_id=c.id) AND NOT EXISTS(SELECT 1 FROM oauth_requests r WHERE r.client_id=c.id) ORDER BY c.expires_at,c.id LIMIT $1)',
    [batch],
  );
}

async function cleanGrants(tx: SqlExecutor, policy: CmsPolicy): Promise<void> {
  const candidates = await tx.query<{ id: string }>(
    `SELECT g.id FROM credential_grants g WHERE least(g.expires_at,coalesce(g.revoked_at,g.expires_at))<clock_timestamp()-$1*interval '1 millisecond'
    AND NOT EXISTS(SELECT 1 FROM credential_grants child WHERE child.parent_id=g.id)
    AND NOT EXISTS(SELECT 1 FROM credential_tokens t WHERE t.grant_id=g.id)
    AND NOT EXISTS(SELECT 1 FROM oauth_requests r WHERE r.grant_id=g.id)
    ORDER BY g.created_at DESC,g.id LIMIT $2`,
    [policy.retentionMs, policy.delegation.grantCleanupBatchSize],
  );
  for (const { id } of candidates.rows) await tryDeleteGrant(tx, id);
}

async function tryDeleteGrant(tx: SqlExecutor, id: string): Promise<void> {
  await tx.query('SAVEPOINT credential_cleanup');
  try {
    await tx.query('DELETE FROM credential_grants WHERE id=$1', [id]);
    await tx.query('RELEASE SAVEPOINT credential_cleanup');
  } catch (error) {
    await tx.query('ROLLBACK TO SAVEPOINT credential_cleanup');
    await tx.query('RELEASE SAVEPOINT credential_cleanup');
    if (error === null || typeof error !== 'object' || !('code' in error) || error.code !== '23503')
      throw error;
  }
}
