import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { AssetsOptions, UploadRow } from '../types.ts';
import { assetsInputSchemas } from '../input-schemas.ts';
import { parse, digest, detectMime, failureCode } from '../validation.ts';
import { assetTransaction, audit, run } from '../runtime.ts';
import { ownedSession } from './access-session.ts';
import { readBytes } from './read-bytes.ts';
import type { createCapacity } from './capacity.ts';

async function claim(
  runtime: AssetsOptions,
  input: { ctx: RequestContext; collection: string; uploadId: string },
) {
  return run(
    runtime,
    { ctx: input.ctx, operationId: 'assets.writeUpload', collectionKey: input.collection },
    async (state) => {
      const row = await ownedSession(runtime, state, { ...input, forMutation: true });
      if (row.status !== 'pending' || !row.is_active) fail('version_conflict');
      const objectId = randomUUID();
      const key = `objects/${objectId}`;
      await state.tx.query(
        `INSERT INTO asset_objects(id,object_key,state,retain_until,write_deadline) VALUES($1,$2,'pending',clock_timestamp()+$3*interval '1 millisecond',clock_timestamp()+$4*interval '1 millisecond')`,
        [objectId, key, runtime.limits.retentionMs, runtime.limits.uploadTimeoutMs],
      );
      await state.tx.query(
        `UPDATE asset_uploads SET status='uploading',generation=generation+1,original_object_id=$2,lease_until=clock_timestamp()+$3*interval '1 millisecond' WHERE id=$1`,
        [row.id, objectId, runtime.limits.uploadTimeoutMs],
      );
      return { row, objectId, key, generation: row.generation + 1 };
    },
  );
}

async function store(
  runtime: AssetsOptions,
  input: { row: UploadRow; key: string; stream: ReadableStream<Uint8Array>; signal: AbortSignal },
) {
  const bytes = await readBytes({
    stream: input.stream,
    maxBytes: input.row.settings.maxBytes,
    expectedBytes: input.row.declared_bytes,
    signal: input.signal,
  });
  const mimeType = detectMime(bytes);
  if (mimeType !== input.row.declared_type || !input.row.settings.mimeTypes.includes(mimeType))
    fail('unsupported_media_type');
  const hash = digest(bytes);
  await runtime.storage.put({ key: input.key, bytes, mimeType, signal: input.signal });
  return { bytes: bytes.byteLength, mimeType, digest: hash };
}

async function confirm(
  runtime: AssetsOptions,
  input: {
    ctx: RequestContext;
    collection: string;
    uploadId: string;
    candidate: Awaited<ReturnType<typeof claim>>;
    stored: Awaited<ReturnType<typeof store>>;
  },
) {
  return run(
    runtime,
    { ctx: input.ctx, operationId: 'assets.writeUpload', collectionKey: input.collection },
    async (state) => {
      const row = await ownedSession(runtime, state, { ...input, forMutation: true });
      if (
        row.status !== 'uploading' ||
        row.generation !== input.candidate.generation ||
        !row.lease_until ||
        !row.lease_active
      )
        fail('version_conflict');
      await state.tx.query(
        "UPDATE asset_objects SET state='ready',bytes=$2,digest=$3,mime_type=$4 WHERE id=$1",
        [input.candidate.objectId, input.stored.bytes, input.stored.digest, input.stored.mimeType],
      );
      await state.tx.query('UPDATE asset_uploads SET lease_until=NULL WHERE id=$1', [row.id]);
      await audit(state.tx, {
        runtime,
        actorId: state.actor.id,
        operationId: 'assets.writeUpload',
        requestId: input.ctx.requestId,
        targetId: row.id,
      });
      return { uploadId: row.id, bytes: input.stored.bytes, digest: input.stored.digest };
    },
  );
}

export function createUploadWriter(
  runtime: AssetsOptions & { signal: AbortSignal },
  capacity: ReturnType<typeof createCapacity>,
) {
  return async function writeUpload(
    ctx: RequestContext,
    raw: unknown,
    stream: ReadableStream<Uint8Array>,
  ) {
    const data = parse(assetsInputSchemas(runtime.policy)['assets.writeUpload'], raw);
    const timeout = AbortSignal.timeout(runtime.limits.uploadTimeoutMs);
    const signal = AbortSignal.any([runtime.signal, timeout, ...(ctx.signal ? [ctx.signal] : [])]);
    return capacity.run(signal, async () => {
      const candidate = await claim(runtime, { ctx, ...data });
      try {
        const stored = await store(runtime, {
          row: candidate.row,
          key: candidate.key,
          stream,
          signal,
        });
        return await confirm(runtime, { ctx, ...data, candidate, stored });
      } catch (error) {
        await assetTransaction(runtime, (tx) =>
          tx.query(
            `UPDATE asset_uploads SET status='failed',failure_code=$3,lease_until=NULL WHERE id=$1 AND generation=$2 AND status='uploading'`,
            [data.uploadId, candidate.generation, failureCode(error)],
          ),
        );
        throw error;
      }
    });
  };
}
