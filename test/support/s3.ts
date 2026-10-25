import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createS3Storage } from '../../apps/api/src/adapters/storage/s3.ts';

interface TestS3State {
  objects: Map<string, { bytes: Uint8Array; type: string }>;
  stallDeletes: boolean;
}

export async function createTestS3(input: { timeoutMs: number }) {
  const state: TestS3State = { objects: new Map(), stallDeletes: false };
  const server = createServer((request, response) => {
    void serveObject(request, response, state);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected S3 fixture TCP address');
  const driver = createS3Storage({
    bucket: 'private-assets',
    region: 'us-east-1',
    forcePathStyle: true,
    endpoint: `http://127.0.0.1:${address.port}`,
    timeoutMs: input.timeoutMs,
    credentials: { accessKeyId: 'fixture-access-key', secretAccessKey: 'fixture-secret-key' },
  });
  let closing: Promise<void> | undefined;
  async function closeServer(): Promise<void> {
    await driver.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
      server.closeAllConnections();
    });
  }
  return {
    driver,
    objects: state.objects,
    setDeleteStalled(value: boolean) {
      state.stallDeletes = value;
    },
    close() {
      closing ??= closeServer();
      return closing;
    },
  };
}

async function serveObject(
  request: IncomingMessage,
  response: ServerResponse,
  state: TestS3State,
): Promise<void> {
  const key = new URL(request.url ?? '/', 'http://localhost').pathname;
  if (request.method === 'HEAD') {
    response.writeHead(200);
    response.end();
    return;
  }
  if (request.method === 'DELETE') {
    if (state.stallDeletes) return;
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
    state.objects.set(key, {
      bytes: Buffer.concat(chunks),
      type: String(request.headers['content-type']),
    });
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
