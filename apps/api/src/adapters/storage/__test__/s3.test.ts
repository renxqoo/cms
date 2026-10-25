import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, expect, it } from 'vitest';
import { createS3Storage } from '../s3.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).toReversed()) await close();
});

async function s3Fixture() {
  const objects = new Map<string, { bytes: Uint8Array; type: string }>();
  const requests: { method: string; key: string; immutable: string | undefined }[] = [];
  const server = createServer((request, response) => {
    void handle(request, response, { objects, requests });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  cleanups.push(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  );
  const driver = createS3Storage({
    bucket: 'private-assets',
    region: 'us-east-1',
    forcePathStyle: true,
    endpoint: `http://127.0.0.1:${address.port}`,
    timeoutMs: 5000,
    credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
  });
  cleanups.push(() => driver.close());
  return { driver, objects, requests };
}

async function handle(
  request: IncomingMessage,
  response: ServerResponse,
  state: {
    objects: Map<string, { bytes: Uint8Array; type: string }>;
    requests: { method: string; key: string; immutable: string | undefined }[];
  },
): Promise<void> {
  const key = new URL(request.url ?? '/', 'http://localhost').pathname;
  const immutable = request.headers['if-none-match'];
  state.requests.push({
    method: request.method ?? '',
    key,
    immutable: typeof immutable === 'string' ? immutable : undefined,
  });
  if (request.method === 'HEAD') {
    response.writeHead(200);
    response.end();
    return;
  }
  if (request.method === 'DELETE') {
    state.objects.delete(key);
    response.writeHead(204);
    response.end();
    return;
  }
  if (request.method === 'PUT') {
    if (state.objects.has(key)) {
      response.writeHead(412, { 'content-type': 'application/xml' });
      response.end('<Error><Code>PreconditionFailed</Code></Error>');
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      const value: unknown = chunk;
      if (Buffer.isBuffer(value)) chunks.push(value);
    }
    const bytes = Buffer.concat(chunks);
    state.objects.set(key, { bytes, type: String(request.headers['content-type']) });
    response.writeHead(200, { etag: '"immutable"' });
    response.end();
    return;
  }
  const object = state.objects.get(key);
  if (!object) {
    response.writeHead(404, { 'content-type': 'application/xml' });
    response.end('<Error><Code>NoSuchKey</Code></Error>');
    return;
  }
  response.writeHead(200, {
    'content-type': object.type,
    'content-length': object.bytes.byteLength,
    'x-amz-checksum-sha256': createHash('sha256').update(object.bytes).digest('base64'),
  });
  response.end(object.bytes);
}

it('uses real S3 HTTP commands with conditional immutable writes and private byte streams', async () => {
  const { driver, objects, requests } = await s3Fixture();
  const signal = AbortSignal.timeout(5000);
  const key = `objects/${randomUUID()}`;
  const bytes = new TextEncoder().encode('real private object body');
  await driver.verify();
  await driver.put({ key, bytes, mimeType: 'application/pdf', signal });
  expect(requests).toContainEqual({ method: 'PUT', key: `/private-assets/${key}`, immutable: '*' });
  await expect(driver.put({ key, bytes, mimeType: 'application/pdf', signal })).rejects.toThrow(
    /./,
  );
  const body = await driver.read({ key, signal });
  expect(new Uint8Array(await new Response(body).arrayBuffer())).toEqual(bytes);
  await driver.remove({ key, signal });
  await driver.remove({ key, signal });
  expect(objects.size).toBe(0);
  await expect(driver.read({ key, signal })).rejects.toThrow(/./);
  await driver.close();
  await expect(driver.verify()).rejects.toThrow('closed');
});

it('rejects invalid keys and aborts requests before sending bytes', async () => {
  const { driver } = await s3Fixture();
  const signal = AbortSignal.timeout(5000);
  await expect(driver.read({ key: '../escape', signal })).rejects.toThrow('Invalid object key');
  const controller = new AbortController();
  controller.abort();
  await expect(
    driver.put({
      key: `objects/${randomUUID()}`,
      bytes: new Uint8Array([1]),
      mimeType: 'application/pdf',
      signal: controller.signal,
    }),
  ).rejects.toThrow(/./);
});
