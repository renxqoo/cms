import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import { z } from 'zod';
import type { AssetsOptions, AssetJobView } from '../types.ts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import { session } from '../runtime.ts';
import { authorizeSession } from '../uploads/access-session.ts';
import { readManifest } from '../manifests/read-manifest.ts';
import { parse } from '../validation.ts';
import type { JobRow } from '../processing/types.ts';

const inputSchema = z.strictObject({ collection: z.string(), jobId: z.uuid() });

async function readInTransaction(
  runtime: AssetsOptions,
  { ctx, input, tx }: { ctx: RequestContext; input: z.infer<typeof inputSchema>; tx: SqlExecutor },
): Promise<AssetJobView> {
  const rows = await tx.query<JobRow>(
    'SELECT * FROM asset_jobs WHERE id=$1 AND collection_key=$2',
    [input.jobId, input.collection],
  );
  const [job] = rows.rows;
  const operationId = job?.action === 'reprocess' ? 'assets.reprocess' : 'assets.completeUpload';
  const actor = await runtime.authorize(tx, ctx, operationId, {
    scopeKind: 'collection',
    collectionKey: input.collection,
  });
  if (!actor) fail('unauthenticated');
  if (!job || job.actor_id !== actor.id) fail('not_found');
  const upload = await session(tx, {
    id: job.upload_id,
    collectionKey: input.collection,
    actorId: actor.id,
  });
  await authorizeSession(runtime, { tx, actor, ctx, operationId }, { row: upload });
  return {
    id: job.id,
    collection: job.collection_key,
    action: job.action,
    status: job.status,
    attempts: job.attempts,
    failureCode: job.failure_code,
    uploadId: job.upload_id,
    manifest: job.manifest_id ? await readManifest(tx, { manifestId: job.manifest_id }) : null,
  };
}

export function createJobReader(runtime: AssetsOptions) {
  return async function readJob(
    ctx: RequestContext,
    raw: unknown,
    provided?: SqlExecutor,
  ): Promise<AssetJobView> {
    const input = parse(inputSchema, raw);
    if (provided) {
      ctx.signal?.throwIfAborted();
      await provided.query('SELECT pg_advisory_xact_lock_shared($1::bigint)', [
        runtime.policy.securityLockKey,
      ]);
      const value = await readInTransaction(runtime, { ctx, input, tx: provided });
      ctx.signal?.throwIfAborted();
      return value;
    }
    return securityTransaction(runtime.database, runtime.policy, {
      mode: 'shared',
      ...(ctx.signal ? { signal: ctx.signal } : {}),
      work: (tx) => readInTransaction(runtime, { ctx, input, tx }),
    });
  };
}
