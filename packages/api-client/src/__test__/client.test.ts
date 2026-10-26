import { describe, expect, it, vi } from 'vitest';
import { apiOrigin, createApiClient, readBytes } from '../client.ts';
import { operationFor, operations, validateInput } from '../operations.ts';

const id = '11111111-1111-4111-8111-111111111111';
const config = {
  origin: 'https://cms.example',
  token: 'private',
  timeoutMs: 1000,
  maxResponseBytes: 4096,
  maxFileBytes: 8,
};

it('serializes complex query values, explicit null and a versioned DELETE without duplicate query or body', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ rows: [] }));
  const client = createApiClient({ ...config, fetch: fetcher });
  await client.call('documents.list', {
    collection: 'articles',
    where: { title: { eq: 'A&B' } },
    sort: [{ field: 'title', order: 'asc' }],
    select: ['title'],
    fallback: ['en'],
    folderId: null,
  });
  const [url, init] = fetcher.mock.calls[0] ?? [];
  const parsed = new URL(new Request(url ?? 'https://invalid.example').url);
  expect(parsed.pathname).toBe('/v1/collections/articles/documents');
  expect(parsed.searchParams.get('where')).toBe('{"title":{"eq":"A&B"}}');
  expect(parsed.searchParams.get('sort')).toBe('[{"field":"title","order":"asc"}]');
  expect(parsed.searchParams.get('select')).toBe('["title"]');
  expect(parsed.searchParams.get('fallback')).toBe('["en"]');
  expect(parsed.searchParams.get('folderId')).toBe('null');
  expect(init?.redirect).toBe('error');
  expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private');
  fetcher.mockResolvedValue(new Response(null, { status: 204 }));
  await expect(client.call('roles.delete', { id, version: 7 })).resolves.toBeNull();
  const [deleteUrl, deleteInit] = fetcher.mock.calls[1] ?? [];
  expect(deleteUrl).toBe(`https://cms.example/v1/roles/${id}?version=7`);
  expect(deleteInit?.body).toBeUndefined();
});

it('keeps idempotency and never retries network failures or non-success CMS responses', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ error: { code: 'version_conflict', requestId: 'r-123' } }, { status: 409 }),
    );
  const client = createApiClient({ ...config, fetch: fetcher });
  await expect(
    client.call(
      'roles.create',
      { code: 'editors', name: 'Editors' },
      { idempotencyKey: 'same-request-key-123' },
    ),
  ).rejects.toMatchObject({ status: 409, code: 'version_conflict', requestId: 'r-123' });
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('idempotency-key')).toBe(
    'same-request-key-123',
  );
  fetcher.mockRejectedValue(new TypeError('network failed'));
  await expect(client.call('access.me', {})).rejects.toThrow('network failed');
  expect(fetcher).toHaveBeenCalledTimes(2);
  await expect(client.call('roles.create', { code: 'editors', name: 'Editors' })).rejects.toThrow(
    'idempotency',
  );
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([403, 429, 500])(
  'keeps HTTP %s as a failure including request ID from headers for invalid JSON',
  async (status) => {
    const client = createApiClient({
      ...config,
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response('unavailable', { status, headers: { 'x-request-id': 'trace' } }),
        ),
    });
    await expect(client.call('access.me', {})).rejects.toMatchObject({
      status,
      code: `http_${status}`,
      requestId: 'trace',
    });
  },
);

it('uploads and downloads binary data unchanged and reads encoded filenames without choosing a filesystem path', async () => {
  const original = new Uint8Array([0, 255, 128, 13, 10, 0]);
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async (_url, init) =>
      Response.json({ bytes: new Uint8Array(await new Response(init?.body).arrayBuffer()).length }),
    );
  const client = createApiClient({ ...config, fetch: fetcher });
  await expect(
    client.call('assets.writeUpload', { collection: 'media', uploadId: id }, { bytes: original }),
  ).resolves.toEqual({ bytes: 6 });
  expect(
    new Uint8Array(await new Response(fetcher.mock.calls[0]?.[1]?.body).arrayBuffer()),
  ).toEqual(original);
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('content-type')).toBe(
    'application/octet-stream',
  );
  fetcher.mockResolvedValue(
    new Response(original, {
      headers: {
        'content-disposition': "attachment; filename*=UTF-8''%E6%96%87%E4%BB%B6.bin",
        'content-type': 'image/png',
      },
    }),
  );
  await expect(client.call('assets.download', { collection: 'media', id })).resolves.toEqual({
    data: original,
    bytes: 6,
    filename: '文件.bin',
    mimeType: 'image/png',
  });
  await expect(
    client.call(
      'assets.writeUpload',
      { collection: 'media', uploadId: id },
      { bytes: new Uint8Array(9) },
    ),
  ).rejects.toMatchObject({ code: 'payload_too_large' });
  await expect(
    client.call('assets.writeUpload', { collection: 'media', uploadId: id }),
  ).rejects.toThrow('Upload bytes');
});

it('enforces streaming bounds and cancels readers even without a Content-Length', async () => {
  const cancel = vi.fn<() => void>();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(9));
    },
    cancel,
  });
  await expect(readBytes(new Response(stream), 8)).rejects.toMatchObject({
    code: 'payload_too_large',
  });
  expect(cancel).toHaveBeenCalledOnce();
  await expect(
    readBytes(new Response('large', { headers: { 'content-length': '99' } }), 8),
  ).rejects.toMatchObject({ status: 413 });
  await expect(readBytes(new Response(null), 8)).resolves.toEqual(new Uint8Array());
});

it('propagates cancellation to the request and rejects unsafe origins or invalid input before sending credentials', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation((_url, init) => Promise.reject(init?.signal?.reason));
  await expect(
    createApiClient({ ...config, fetch: fetcher }).call(
      'access.me',
      {},
      { signal: controller.signal },
    ),
  ).rejects.toThrow(Error);
  for (const value of [
    'http://cms.example',
    'https://u:p@cms.example',
    'https://cms.example/path',
    'https://cms.example?token=secret',
  ])
    expect(() => apiOrigin(value)).toThrow(Error);
  expect(apiOrigin('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
  expect(() => validateInput('roles.delete', { id, version: -1 })).toThrow(Error);
  expect(() => operationFor('missing.operation')).toThrow('Unknown');
  expect(() => validateInput('access.me', { token: 'secret' })).toThrow(Error);
});

describe('generated operational contract', () => {
  it('gives every registered operation one unique CLI route and MCP tool name', () => {
    expect(new Set(operations.map((operation) => operation.command)).size).toBe(operations.length);
    expect(new Set(operations.map((operation) => operation.tool)).size).toBe(operations.length);
    expect(operationFor('assets.downloadBinding').transport).toBe('download');
  });
});
