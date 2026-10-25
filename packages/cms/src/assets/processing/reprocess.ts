import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { withIdempotency } from '@new-cms/cms/platform/idempotency';
import type { AssetsOptions, ContentAuthorization } from '../types.ts';
import { assetsInputSchemas } from '../input-schemas.ts';
import { audit, run } from '../runtime.ts';
import { parse, validateRecipe, validateSettings } from '../validation.ts';
import type { AssetState } from '../runtime.ts';
import type { z } from 'zod';
import { assertUploadCapacity } from '../uploads/quota.ts';

async function createJob(
  runtime: AssetsOptions,
  state: AssetState,
  data: z.infer<ReturnType<typeof assetsInputSchemas>['assets.reprocess']>,
) {
  const authorization = await runtime.authorizeContent(state.tx, {
    operationId: state.operationId,
    actor: state.actor,
    action: 'reprocess',
    collectionKey: data.collection,
    documentId: data.id,
    revision: data.revision,
  });
  if (!authorization.manifestId) fail('not_found');
  validateSettings(authorization.upload, runtime.limits);
  validateRecipe(data.recipe, runtime.limits);
  const source = await state.tx.query<{
    object_id: string;
    filename: string;
    mime_type: string;
    bytes: number;
  }>(
    `SELECT mo.object_id,m.filename,m.mime_type,m.bytes::float8 AS bytes FROM asset_manifests m JOIN asset_manifest_objects mo ON mo.manifest_id=m.id
     WHERE m.id=$1 AND m.state='ready' AND mo.name='original' FOR UPDATE OF m`,
    [authorization.manifestId],
  );
  const [original] = source.rows;
  if (!original || !original.mime_type.startsWith('image/')) fail('unsupported_media_type');
  const { uploadId, jobId } = await insertReprocessing(runtime, state, {
    data,
    original,
    authorization,
  });
  await audit(state.tx, {
    runtime,
    actorId: state.actor.id,
    operationId: 'assets.reprocess',
    requestId: state.ctx.requestId,
    targetId: data.id,
    detail: { jobId, revision: data.revision },
  });
  return { jobId, uploadId };
}

export function createReprocessor(runtime: AssetsOptions) {
  return function reprocess(ctx: RequestContext, raw: unknown) {
    const data = parse(assetsInputSchemas(runtime.policy)['assets.reprocess'], raw);
    return run(
      runtime,
      { ctx, operationId: 'assets.reprocess', collectionKey: data.collection },
      async (state) => {
        const result = await withIdempotency(
          state.tx,
          {
            actorId: state.actor.id,
            operationId: 'assets.reprocess',
            scope: { scopeKind: 'collection', collectionKey: data.collection },
            key: ctx.idempotencyKey,
            input: data,
            ttlMs: runtime.policy.idempotencyTtlMs,
          },
          () => createJob(runtime, state, data),
        );
        await runtime.authorizeContent(state.tx, {
          operationId: state.operationId,
          actor: state.actor,
          action: 'reprocess',
          collectionKey: data.collection,
          documentId: data.id,
          revision: data.revision,
          reauthorizeOnly: true,
        });
        return result;
      },
    );
  };
}

async function insertReprocessing(
  runtime: AssetsOptions,
  state: AssetState,
  input: {
    data: z.infer<ReturnType<typeof assetsInputSchemas>['assets.reprocess']>;
    original: { object_id: string; filename: string; mime_type: string; bytes: number };
    authorization: ContentAuthorization;
  },
) {
  const { data, original, authorization } = input;
  await assertUploadCapacity(state.tx, {
    actorId: state.actor.id,
    bytes: original.bytes,
    limits: runtime.limits,
  });
  const uploadId = randomUUID();
  const jobId = randomUUID();
  await state.tx.query(
    `INSERT INTO asset_uploads(id,actor_id,collection_key,purpose,document_id,expected_revision,filename,declared_type,declared_bytes,settings,status,expires_at,original_object_id)
     VALUES($1,$2,$3,'replace',$4,$5,$6,$7,$8,$9::jsonb,'processing',clock_timestamp()+$10*interval '1 millisecond',$11)`,
    [
      uploadId,
      state.actor.id,
      data.collection,
      data.id,
      data.revision,
      original.filename,
      original.mime_type,
      original.bytes,
      JSON.stringify(authorization.upload),
      runtime.limits.sessionTtlMs,
      original.object_id,
    ],
  );
  await state.tx.query(
    `INSERT INTO asset_jobs(id,actor_id,collection_key,action,upload_id,document_id,expected_revision,recipe,status) VALUES($1,$2,$3,'reprocess',$4,$5,$6,$7::jsonb,'queued')`,
    [
      jobId,
      state.actor.id,
      data.collection,
      uploadId,
      data.id,
      data.revision,
      JSON.stringify(data.recipe),
    ],
  );
  await state.tx.query('UPDATE asset_uploads SET job_id=$2 WHERE id=$1', [uploadId, jobId]);
  return { uploadId, jobId };
}
