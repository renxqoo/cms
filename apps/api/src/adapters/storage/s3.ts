import { createHash } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { StorageDriver } from '@new-cms/cms/assets/composition';

export interface S3StorageOptions {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle: boolean;
  timeoutMs: number;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

function requireKey(key: string): string {
  if (!/^objects\/[0-9a-f-]{36}$/.test(key)) throw new Error('Invalid object key');
  return key;
}

export function createS3Storage(input: S3StorageOptions): StorageDriver {
  const client = configuredClient(input);
  let closed = false;
  function check(): void {
    if (closed) throw new Error('Storage is closed');
  }
  return {
    capabilities: { shared: true, directUpload: false, multipart: false, writeSettleMs: null },
    async put(data) {
      check();
      return putObject(client, { bucket: input.bucket, data, timeoutMs: input.timeoutMs });
    },
    async read(data) {
      check();
      return readObject(client, { bucket: input.bucket, data, timeoutMs: input.timeoutMs });
    },
    async remove(data) {
      check();
      await withinDeadline({
        timeoutMs: input.timeoutMs,
        signal: data.signal,
        work: (signal) =>
          client.send(
            new DeleteObjectCommand({ Bucket: input.bucket, Key: requireKey(data.key) }),
            { abortSignal: signal },
          ),
      });
    },
    async verify(signal) {
      check();
      await withinDeadline({
        timeoutMs: input.timeoutMs,
        signal,
        work: (requestSignal) =>
          client.send(new HeadBucketCommand({ Bucket: input.bucket }), {
            abortSignal: requestSignal,
          }),
      });
    },
    close() {
      closed = true;
      client.destroy();
      return Promise.resolve();
    },
  };
}

async function putObject(
  client: S3Client,
  input: { bucket: string; data: Parameters<StorageDriver['put']>[0]; timeoutMs: number },
): Promise<void> {
  const { data } = input;
  await withinDeadline({
    timeoutMs: input.timeoutMs,
    signal: data.signal,
    work: (signal) =>
      client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: requireKey(data.key),
          Body: data.bytes,
          ContentType: data.mimeType,
          ContentLength: data.bytes.byteLength,
          IfNoneMatch: '*',
          ChecksumSHA256: createHash('sha256').update(data.bytes).digest('base64'),
        }),
        { abortSignal: signal },
      ),
  });
}

async function readObject(
  client: S3Client,
  input: { bucket: string; data: Parameters<StorageDriver['read']>[0]; timeoutMs: number },
) {
  const { data } = input;
  const response = await withinDeadline({
    timeoutMs: input.timeoutMs,
    signal: data.signal,
    work: (signal) =>
      client.send(
        new GetObjectCommand({
          Bucket: input.bucket,
          Key: requireKey(data.key),
          ChecksumMode: 'ENABLED',
        }),
        { abortSignal: signal },
      ),
  });
  if (!response.Body) throw new Error('Storage object has no body');
  return response.Body.transformToWebStream();
}

async function withinDeadline<T>(input: {
  timeoutMs: number;
  signal?: AbortSignal | undefined;
  work(signal: AbortSignal): Promise<T>;
}): Promise<T> {
  input.signal?.throwIfAborted();
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error('Storage request timed out')),
    input.timeoutMs,
  );
  timer.unref();
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  try {
    return await input.work(signal);
  } finally {
    clearTimeout(timer);
  }
}

function configuredClient(input: S3StorageOptions): S3Client {
  return new S3Client({
    region: input.region,
    forcePathStyle: input.forcePathStyle,
    ...(input.endpoint ? { endpoint: input.endpoint } : {}),
    maxAttempts: 1,
    ...(input.credentials ? { credentials: input.credentials } : {}),
  });
}
