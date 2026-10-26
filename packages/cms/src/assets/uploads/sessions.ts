import { randomUUID } from 'node:crypto';
import { actorReference } from '@new-cms/cms/access';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import { fail } from '@new-cms/cms/platform/contracts';
import { withIdempotency } from '@new-cms/cms/platform/idempotency';
import type { z } from 'zod';
import { assetsInputSchemas } from '../input-schemas.ts';
import type { AssetsOptions, UploadRow } from '../types.ts';
import { audit, run } from '../runtime.ts';
import type { AssetState } from '../runtime.ts';
import { parse, validateSettings } from '../validation.ts';
import { sessionView } from './session-view.ts';
import { assertUploadCapacity } from './quota.ts';
import { ownedSession, authorizeSession } from './access-session.ts';

function idempotent<T>(
  runtime: AssetsOptions,
  state: AssetState,
  input: { operationId: string; collection: string; data: unknown; work: () => Promise<T> },
) {
  return withIdempotency(
    state.tx,
    {
      actor: actorReference(state.actor),
      operationId: input.operationId,
      scope: { scopeKind: 'collection', collectionKey: input.collection },
      key: state.ctx.idempotencyKey,
      input: input.data,
      ttlMs: runtime.policy.idempotencyTtlMs,
    },
    input.work,
  );
}

async function insertSession(
  runtime: AssetsOptions,
  state: AssetState,
  data: z.infer<ReturnType<typeof assetsInputSchemas>['assets.createUpload']>,
) {
  const authorized = await authorizeCreation(runtime, state, data);
  await assertUploadCapacity(state.tx, {
    actorId: state.actor.id,
    bytes: data.bytes,
    limits: runtime.limits,
  });
  const id = randomUUID();
  await state.tx.query(
    `INSERT INTO asset_uploads(id,actor_id,collection_key,purpose,document_id,expected_revision,filename,declared_type,declared_bytes,settings,status,expires_at,delegation_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,'pending',clock_timestamp()+$11*interval '1 millisecond',$12)`,
    [
      id,
      state.actor.id,
      data.collection,
      data.purpose,
      data.documentId ?? null,
      data.revision ?? null,
      data.filename,
      data.mimeType,
      data.bytes,
      JSON.stringify(authorized.upload),
      runtime.limits.sessionTtlMs,
      state.actor.delegation?.id ?? null,
    ],
  );
  await audit(state.tx, {
    runtime,
    actorId: state.actor.id,
    operationId: 'assets.createUpload',
    requestId: state.ctx.requestId,
    targetId: id,
  });
  return { id };
}

async function queueProcessing(runtime: AssetsOptions, state: AssetState, row: UploadRow) {
  await authorizeSession(runtime, state, { row, forMutation: true });
  if (
    row.status !== 'uploading' ||
    row.lease_until !== null ||
    !row.original_object_id ||
    !row.is_active
  )
    fail('version_conflict');
  const object = await state.tx.query(
    "SELECT id FROM asset_objects WHERE id=$1 AND state='ready'",
    [row.original_object_id],
  );
  if (object.rowCount !== 1) fail('version_conflict');
  const jobId = randomUUID();
  await state.tx.query(
    `INSERT INTO asset_jobs(id,actor_id,collection_key,action,upload_id,recipe,status,delegation_id) VALUES($1,$2,$3,'process',$4,$5::jsonb,'queued',$6)`,
    [
      jobId,
      state.actor.id,
      row.collection_key,
      row.id,
      JSON.stringify(row.settings.recipe),
      state.actor.delegation?.id ?? null,
    ],
  );
  await state.tx.query("UPDATE asset_uploads SET status='processing',job_id=$2 WHERE id=$1", [
    row.id,
    jobId,
  ]);
  await audit(state.tx, {
    runtime,
    actorId: state.actor.id,
    operationId: 'assets.completeUpload',
    requestId: state.ctx.requestId,
    targetId: row.id,
    detail: { jobId },
  });
  return { id: row.id };
}

function createUploader(runtime: AssetsOptions) {
  return function createUpload(ctx: RequestContext, raw: unknown) {
    const data = parse(assetsInputSchemas(runtime.policy)['assets.createUpload'], raw);
    return run(
      runtime,
      { ctx, operationId: 'assets.createUpload', collectionKey: data.collection },
      async (state) => {
        const ref = await idempotent(runtime, state, {
          operationId: 'assets.createUpload',
          collection: data.collection,
          data,
          work: () => insertSession(runtime, state, data),
        });
        return sessionView(
          state.tx,
          await ownedSession(runtime, state, { collection: data.collection, uploadId: ref.id }),
        );
      },
    );
  };
}

function createReader(runtime: AssetsOptions) {
  return function readUpload(ctx: RequestContext, raw: unknown) {
    const data = parse(assetsInputSchemas(runtime.policy)['assets.readUpload'], raw);
    return run(
      runtime,
      { ctx, operationId: 'assets.readUpload', collectionKey: data.collection },
      async (state) => sessionView(state.tx, await ownedSession(runtime, state, data)),
    );
  };
}

function createCompleter(runtime: AssetsOptions) {
  return function completeUpload(ctx: RequestContext, raw: unknown) {
    const data = parse(assetsInputSchemas(runtime.policy)['assets.completeUpload'], raw);
    return run(
      runtime,
      { ctx, operationId: 'assets.completeUpload', collectionKey: data.collection },
      async (state) => {
        const ref = await idempotent(runtime, state, {
          operationId: 'assets.completeUpload',
          collection: data.collection,
          data,
          work: async () => {
            const row = await ownedSession(runtime, state, { ...data, forMutation: true });
            return queueProcessing(runtime, state, row);
          },
        });
        return sessionView(
          state.tx,
          await ownedSession(runtime, state, { ...data, uploadId: ref.id }),
        );
      },
    );
  };
}

function createCanceller(runtime: AssetsOptions) {
  return function cancelUpload(ctx: RequestContext, raw: unknown) {
    const data = parse(assetsInputSchemas(runtime.policy)['assets.cancelUpload'], raw);
    return run(
      runtime,
      { ctx, operationId: 'assets.cancelUpload', collectionKey: data.collection },
      async (state) => {
        const row = await ownedSession(runtime, state, { ...data, lockJob: true });
        if (row.status === 'consumed') fail('resource_in_use');
        if (['cancelled', 'expired'].includes(row.status)) return;
        await state.tx.query(
          "UPDATE asset_jobs SET status='cancelled',generation=generation+1,finished_at=clock_timestamp() WHERE upload_id=$1 AND status IN('queued','running')",
          [row.id],
        );
        await state.tx.query(
          "UPDATE asset_uploads SET status='cancelled',generation=generation+1 WHERE id=$1",
          [row.id],
        );
        await audit(state.tx, {
          runtime,
          actorId: state.actor.id,
          operationId: 'assets.cancelUpload',
          requestId: ctx.requestId,
          targetId: row.id,
        });
      },
    );
  };
}

export function createSessionApi(runtime: AssetsOptions) {
  return {
    createUpload: createUploader(runtime),
    readUpload: createReader(runtime),
    completeUpload: createCompleter(runtime),
    cancelUpload: createCanceller(runtime),
  };
}

async function authorizeCreation(
  runtime: AssetsOptions,
  state: AssetState,
  data: z.infer<ReturnType<typeof assetsInputSchemas>['assets.createUpload']>,
) {
  if ((data.purpose === 'replace') !== Boolean(data.documentId && data.revision))
    fail('invalid_input');
  if (data.purpose === 'create' && (data.documentId || data.revision)) fail('invalid_input');
  const authorized = await runtime.authorizeContent(state.tx, {
    operationId: state.operationId,
    actor: state.actor,
    action: data.purpose === 'create' ? 'upload' : 'replace',
    collectionKey: data.collection,
    ...(data.documentId ? { documentId: data.documentId } : {}),
    ...(data.revision ? { revision: data.revision } : {}),
  });
  validateSettings(authorized.upload, runtime.limits);
  if (!authorized.upload.mimeTypes.includes(data.mimeType)) fail('unsupported_media_type');
  if (data.bytes > authorized.upload.maxBytes) fail('payload_too_large');

  return authorized;
}
