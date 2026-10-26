import { fail } from '@new-cms/cms/platform/contracts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { AssetsOptions } from '../types.ts';
import type { AssetDownload } from './download.ts';
import { checkedStream } from './checked-stream.ts';

export function createBindingDownloader(runtime: AssetsOptions & { signal: AbortSignal }) {
  return async function openBinding(
    tx: SqlExecutor,
    input: { bindingId: string; signal?: AbortSignal },
  ): Promise<AssetDownload> {
    const result = await tx.query<{
      object_key: string;
      bytes: number;
      digest: string;
      mime_type: string;
      filename: string;
    }>(
      `SELECT o.object_key,o.bytes::float8 AS bytes,o.digest,o.mime_type,m.filename FROM asset_references b JOIN asset_manifests m ON m.id=b.manifest_id JOIN asset_manifest_objects mo ON mo.manifest_id=m.id JOIN asset_objects o ON o.id=mo.object_id WHERE b.id=$1 AND mo.name='original' AND m.state='ready' AND o.state='ready'`,
      [input.bindingId],
    );
    const [descriptor] = result.rows;
    if (!descriptor) fail('not_found');
    const signal = AbortSignal.any([
      runtime.signal,
      AbortSignal.timeout(runtime.limits.uploadTimeoutMs),
      ...(input.signal ? [input.signal] : []),
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
