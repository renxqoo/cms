import type { Principal } from '@new-cms/cms/access';
import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import { securityTransaction } from '@new-cms/cms/platform/security-lock';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetsOptions, ProcessedImage } from '../types.ts';
import { audit, lockAssets } from '../runtime.ts';
import { validateSettings } from '../validation.ts';
import { requireLease } from './claim-job.ts';
import type { CandidateObject, ClaimedJob } from './types.ts';

async function createManifest(
  tx: SqlExecutor,
  input: {
    runtime: AssetsOptions;
    claimed: ClaimedJob;
    image: ProcessedImage;
    candidates: CandidateObject[];
  },
): Promise<string> {
  const { runtime, claimed, image, candidates } = input;
  const objectIds = [claimed.original.id, ...candidates.map((item) => item.id)].toSorted();
  await tx.query('SELECT id FROM asset_objects WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE', [
    objectIds,
  ]);
  for (const candidate of candidates)
    await tx.query("UPDATE asset_objects SET state='ready' WHERE id=$1 AND state='pending'", [
      candidate.id,
    ]);
  const id = randomUUID();
  await tx.query(
    `INSERT INTO asset_manifests(id,filename,mime_type,bytes,digest,width,height,orientation,processor_version,recipe,state,retain_until)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'ready',clock_timestamp()+$11*interval '1 millisecond')`,
    [
      id,
      claimed.upload.filename,
      claimed.original.mime_type,
      claimed.original.bytes,
      claimed.original.digest,
      image.width || null,
      image.height || null,
      image.width ? image.orientation : null,
      runtime.images.version,
      JSON.stringify(claimed.job.recipe),
      runtime.limits.retentionMs,
    ],
  );
  await tx.query(
    "INSERT INTO asset_manifest_objects(manifest_id,object_id,name,width,height) VALUES($1,$2,'original',$3,$4)",
    [id, claimed.original.id, image.width || null, image.height || null],
  );
  for (const candidate of candidates)
    await tx.query(
      'INSERT INTO asset_manifest_objects(manifest_id,object_id,name,width,height) VALUES($1,$2,$3,$4,$5)',
      [id, candidate.id, candidate.name, candidate.width, candidate.height],
    );
  return id;
}

export async function finishJob(
  runtime: AssetsOptions,
  input: {
    claimed: ClaimedJob;
    image: ProcessedImage;
    candidates: CandidateObject[];
    signal: AbortSignal;
  },
): Promise<void> {
  const { claimed } = input;
  await securityTransaction(runtime.database, runtime.policy, {
    mode: 'shared',
    signal: input.signal,
    async work(tx) {
      await lockAssets(tx, runtime);
      const actor = await authorizeWork(tx, { runtime, claimed });
      await commitResult(tx, { ...input, runtime, actor });
    },
  });
}

async function authorizeWork(
  tx: SqlExecutor,
  input: { runtime: AssetsOptions; claimed: ClaimedJob },
) {
  const { runtime, claimed } = input;
  const actor = await runtime.authorizeActor(tx, {
    actorId: claimed.job.actor_id,
    operationId: claimed.job.action === 'reprocess' ? 'assets.reprocess' : 'assets.completeUpload',
    scope: { scopeKind: 'collection', collectionKey: claimed.job.collection_key },
  });
  let action: 'reprocess' | 'replace' | 'upload' =
    claimed.upload.purpose === 'replace' ? 'replace' : 'upload';
  if (claimed.job.action === 'reprocess') action = 'reprocess';
  const authorization = await runtime.authorizeContent(tx, {
    operationId: claimed.job.action === 'reprocess' ? 'assets.reprocess' : 'assets.completeUpload',
    actor,
    action,
    collectionKey: claimed.job.collection_key,
    ...(claimed.upload.document_id ? { documentId: claimed.upload.document_id } : {}),
    ...(claimed.upload.expected_revision ? { revision: claimed.upload.expected_revision } : {}),
  });
  validateSettings(authorization.upload, runtime.limits);

  return actor;
}

async function commitResult(
  tx: SqlExecutor,
  input: {
    runtime: AssetsOptions;
    claimed: ClaimedJob;
    image: ProcessedImage;
    candidates: CandidateObject[];
    actor: Principal;
  },
): Promise<void> {
  const { runtime, claimed, actor } = input;
  await requireLease(tx, claimed.job);
  const session = await tx.query(
    "SELECT id FROM asset_uploads WHERE id=$1 AND status='processing' AND expires_at>clock_timestamp() FOR UPDATE",
    [claimed.upload.id],
  );
  if (session.rowCount !== 1) fail('version_conflict');
  const manifestId = await createManifest(tx, {
    runtime,
    claimed,
    image: input.image,
    candidates: input.candidates,
  });
  await tx.query("UPDATE asset_uploads SET status='ready',manifest_id=$2 WHERE id=$1", [
    claimed.upload.id,
    manifestId,
  ]);
  await bindReprocessing(tx, input);
  await tx.query(
    "UPDATE asset_jobs SET status='succeeded',manifest_id=$2,failure_code=NULL,finished_at=clock_timestamp(),lease_until=NULL WHERE id=$1",
    [claimed.job.id, manifestId],
  );
  await tx.query('DELETE FROM asset_job_objects WHERE job_id=$1 AND generation=$2', [
    claimed.job.id,
    claimed.job.generation,
  ]);
  await audit(tx, {
    runtime,
    actorId: actor.id,
    operationId: claimed.job.action === 'reprocess' ? 'assets.reprocess' : 'assets.completeUpload',
    targetId: claimed.upload.id,
    detail: { jobId: claimed.job.id, manifestId },
  });
}

async function bindReprocessing(
  tx: SqlExecutor,
  input: { runtime: AssetsOptions; claimed: ClaimedJob; actor: Principal },
): Promise<void> {
  const { runtime, claimed, actor } = input;
  if (claimed.job.action === 'reprocess') {
    if (!claimed.job.document_id || !claimed.job.expected_revision) fail('invalid_input');
    await runtime.commitProcessing(tx, {
      actor,
      collectionKey: claimed.job.collection_key,
      documentId: claimed.job.document_id,
      revision: claimed.job.expected_revision,
      uploadId: claimed.upload.id,
      jobId: claimed.job.id,
    });
  }
}
