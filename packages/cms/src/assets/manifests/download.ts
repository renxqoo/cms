import { createHash } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { RequestContext } from '@new-cms/cms/platform/contracts';
import type { AssetsOptions } from '../types.ts';
import { assetsInputSchemas } from '../input-schemas.ts';
import { run } from '../runtime.ts';
import { parse } from '../validation.ts';

export interface AssetDownload {
  stream: ReadableStream<Uint8Array>;
  filename: string;
  bytes: number;
  mimeType: string;
  digest: string;
}

function checkedStream(
  stream: ReadableStream<Uint8Array>,
  input: { bytes: number; digest: string; signal: AbortSignal },
) {
  let size = 0;
  const hash = createHash('sha256');
  const checked = stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        input.signal.throwIfAborted();
        size += chunk.byteLength;
        if (size > input.bytes) fail('invalid_input');
        hash.update(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        if (size !== input.bytes || hash.digest('hex') !== input.digest) fail('invalid_input');
      },
    }),
    { signal: input.signal },
  );
  return checked;
}

export function createDownloader(runtime: AssetsOptions & { signal: AbortSignal }) {
  return async function download(ctx: RequestContext, raw: unknown): Promise<AssetDownload> {
    const operationId =
      raw !== null && typeof raw === 'object' && 'bindingId' in raw
        ? 'assets.downloadBinding'
        : 'assets.download';
    const data = parse(assetsInputSchemas(runtime.policy)[operationId], raw);
    const bindingId =
      'bindingId' in data && typeof data.bindingId === 'string' ? data.bindingId : undefined;
    const descriptor = await descriptorFor(runtime, { ctx, data, bindingId, operationId });
    const signal = AbortSignal.any([
      runtime.signal,
      AbortSignal.timeout(runtime.limits.uploadTimeoutMs),
      ...(ctx.signal ? [ctx.signal] : []),
    ]);
    const stream = await runtime.storage.read({ key: descriptor.object_key, signal });
    return {
      stream: checkedStream(stream, { ...descriptor, signal }),
      filename: descriptor.filename,
      bytes: descriptor.bytes,
      mimeType: descriptor.mime_type,
      digest: descriptor.digest,
    };
  };
}

async function descriptorFor(
  runtime: AssetsOptions,
  input: {
    ctx: RequestContext;
    operationId: string;
    bindingId: string | undefined;
    data: {
      collection: string;
      id: string;
      mode: 'editing' | 'published';
      versionId?: string | undefined;
      variant?: string | undefined;
    };
  },
) {
  const { ctx, data, bindingId, operationId } = input;
  return run(runtime, { ctx, operationId, collectionKey: data.collection }, async (state) => {
    const authorized = await runtime.authorizeContent(state.tx, {
      operationId,
      actor: state.actor,
      action: 'download',
      collectionKey: data.collection,
      documentId: data.id,
      mode: data.mode,
      ...(data.versionId ? { versionId: data.versionId } : {}),
      ...(bindingId ? { bindingId } : {}),
    });
    if (!authorized.manifestId) fail('not_found');
    const rows = await state.tx.query<{
      object_key: string;
      bytes: number;
      digest: string;
      mime_type: string;
      filename: string;
    }>(
      `SELECT o.object_key,o.bytes::float8 AS bytes,o.digest,o.mime_type,m.filename FROM asset_manifests m
         JOIN asset_manifest_objects mo ON mo.manifest_id=m.id JOIN asset_objects o ON o.id=mo.object_id
         WHERE m.id=$1 AND mo.name=$2 AND m.state='ready' AND o.state='ready'`,
      [authorized.manifestId, data.variant ?? 'original'],
    );
    const [row] = rows.rows;
    if (!row) fail('not_found');
    return row;
  });
}
