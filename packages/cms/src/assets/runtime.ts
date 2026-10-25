import { randomUUID } from 'node:crypto';
import { appendAudit } from '@new-cms/cms/audit/composition';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { Principal } from '@new-cms/cms/access';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetsOptions, UploadRow } from './types.ts';

export interface AssetState {
  operationId: string;
  tx: SqlExecutor;
  actor: Principal;
  ctx: RequestContext;
}

export function run<T>(
  runtime: AssetsOptions,
  input: { ctx: RequestContext; operationId: string; collectionKey: string },
  work: (state: AssetState) => Promise<T>,
): Promise<T> {
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    ...(input.ctx.signal ? { signal: input.ctx.signal } : {}),
    async work(tx) {
      if (
        !['assets.readUpload', 'assets.download', 'assets.downloadBinding'].includes(
          input.operationId,
        )
      )
        await lockAssets(tx, runtime);
      const actor = await runtime.authorize(tx, input.ctx, input.operationId, {
        scopeKind: 'collection',
        collectionKey: input.collectionKey,
      });
      if (!actor) fail('unauthenticated');
      return work({ tx, actor, ctx: input.ctx, operationId: input.operationId });
    },
  });
}

export async function session(
  tx: SqlExecutor,
  input: { id: string; collectionKey: string; actorId: string; lock?: boolean },
): Promise<UploadRow> {
  const result = await tx.query<UploadRow>(
    `SELECT *,declared_bytes::float8 AS declared_bytes,expires_at>clock_timestamp() AS is_active,lease_until>clock_timestamp() AS lease_active FROM asset_uploads WHERE id=$1 AND collection_key=$2 AND actor_id=$3${input.lock ? ' FOR UPDATE' : ''}`,
    [input.id, input.collectionKey, input.actorId],
  );
  const [row] = result.rows;
  if (!row) fail('not_found');
  return row;
}

export function audit(
  tx: SqlExecutor,
  input: {
    runtime: AssetsOptions;
    actorId: string;
    operationId: string;
    requestId?: string;
    targetId: string;
    detail?: Record<string, unknown>;
  },
) {
  return appendAudit(
    tx,
    {
      actorKind: 'admin',
      actorId: input.actorId,
      operationId: input.operationId,
      targetType: 'asset',
      targetId: input.targetId,
      requestId: input.requestId ?? randomUUID(),
      detail: input.detail ?? {},
    },
    input.runtime.policy,
  );
}

export function lockAssets(tx: SqlExecutor, runtime: AssetsOptions) {
  return tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [runtime.resourceLockKey]);
}

export function assetTransaction<T>(runtime: AssetsOptions, work: (tx: SqlExecutor) => Promise<T>) {
  return securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    async work(tx) {
      await lockAssets(tx, runtime);
      return work(tx);
    },
  });
}
