import { assetTransaction } from '../runtime.ts';
import { randomUUID } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import type { AssetsOptions, ProcessedImage } from '../types.ts';
import { readBytes } from '../uploads/read-bytes.ts';
import { digest } from '../validation.ts';
import { requireLease } from './claim-job.ts';
import type { CandidateObject, ClaimedJob } from './types.ts';

async function register(
  runtime: AssetsOptions,
  input: { claimed: ClaimedJob; image: ProcessedImage['variants'][number] },
): Promise<CandidateObject> {
  const { image, claimed } = input;
  if (image.bytes.byteLength > runtime.limits.maxOutputBytes) fail('payload_too_large');
  const id = randomUUID();
  const key = `objects/${id}`;
  const candidate = {
    id,
    key,
    name: image.name,
    bytes: image.bytes.byteLength,
    digest: digest(image.bytes),
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
  };
  await assetTransaction(runtime, async (tx) => {
    await requireLease(tx, claimed.job);
    await tx.query(
      `INSERT INTO asset_objects(id,object_key,state,bytes,digest,mime_type,retain_until,write_deadline)
       VALUES($1,$2,'pending',$3,$4,$5,clock_timestamp()+$6*interval '1 millisecond',clock_timestamp()+$7*interval '1 millisecond')`,
      [
        id,
        key,
        candidate.bytes,
        candidate.digest,
        candidate.mimeType,
        runtime.limits.retentionMs,
        runtime.limits.processingTimeoutMs,
      ],
    );
    await tx.query('INSERT INTO asset_job_objects(job_id,generation,object_id) VALUES($1,$2,$3)', [
      claimed.job.id,
      claimed.job.generation,
      id,
    ]);
  });
  return candidate;
}

export async function buildCandidates(
  runtime: AssetsOptions,
  input: { claimed: ClaimedJob; signal: AbortSignal },
) {
  const { claimed, signal } = input;
  const source = await runtime.storage.read({ key: claimed.original.object_key, signal });
  const bytes = await readBytes({
    stream: source,
    maxBytes: runtime.limits.maxUploadBytes,
    expectedBytes: claimed.original.bytes,
    signal,
  });
  if (digest(bytes) !== claimed.original.digest) fail('invalid_input');
  const image: ProcessedImage = claimed.original.mime_type.startsWith('image/')
    ? await runtime.images.process({
        bytes,
        mimeType: claimed.original.mime_type,
        recipe: claimed.job.recipe,
        limits: runtime.limits,
        signal,
      })
    : { width: 0, height: 0, orientation: 1, variants: [] };
  const candidates: CandidateObject[] = [];
  for (const variant of image.variants) {
    signal.throwIfAborted();
    const candidate = await register(runtime, { claimed, image: variant });
    await runtime.storage.put({
      key: candidate.key,
      bytes: variant.bytes,
      mimeType: variant.mimeType,
      signal,
    });
    candidates.push(candidate);
  }
  return { image, candidates };
}
