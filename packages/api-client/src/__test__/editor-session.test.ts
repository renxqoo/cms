import { z } from 'zod';
import { expect, it, vi } from 'vitest';
import { validateInput } from '../operations.ts';
import { createApiClient } from '../client.ts';

const id = '11111111-1111-4111-8111-111111111111';
const editorSessionId = 'ABCDEFAB-1234-4123-8123-ABCDEFABCDEF';
const config = {
  origin: 'https://cms.example',
  timeoutMs: 1000,
  maxResponseBytes: 4096,
  maxFileBytes: 4096,
};
it('regression: owned editor sessions are sent only as request context for JSON, upload, download and empty-body calls', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ revision: 2 }));
  const client = createApiClient({ ...config, fetch: fetcher });
  const options = { idempotencyKey: 'editor-session-request-123', editorSessionId };
  await client.call(
    'documents.update',
    { collection: 'articles', id, revision: 1, data: { title: 'Editor' } },
    options,
  );
  const first = fetcher.mock.calls[0]?.[1];
  expect(new Headers(first?.headers).get('x-cms-editor-session')).toBe(
    editorSessionId.toLowerCase(),
  );
  expect(JSON.parse(z.string().parse(first?.body)) as unknown).toEqual({
    revision: 1,
    data: { title: 'Editor' },
  });
  await client.call(
    'assets.writeUpload',
    { collection: 'media', uploadId: id },
    { ...options, bytes: new Uint8Array([1, 2]) },
  );
  expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('x-cms-editor-session')).toBe(
    editorSessionId.toLowerCase(),
  );
  fetcher.mockResolvedValue(
    new Response(new Uint8Array([3]), { headers: { 'content-type': 'application/pdf' } }),
  );
  await client.call('assets.download', { collection: 'media', id }, options);
  expect(new Headers(fetcher.mock.calls[2]?.[1]?.headers).get('x-cms-editor-session')).toBe(
    editorSessionId.toLowerCase(),
  );
  fetcher.mockResolvedValue(Response.json({ id }));
  await client.call('documents.get', { collection: 'articles', id }, options);
  expect(new Headers(fetcher.mock.calls[3]?.[1]?.headers).get('x-cms-editor-session')).toBe(
    editorSessionId.toLowerCase(),
  );
  expect(fetcher.mock.calls[3]?.[1]?.body).toBeUndefined();
  await client.call('documents.get', { collection: 'articles', id });
  expect(new Headers(fetcher.mock.calls[4]?.[1]?.headers).get('x-cms-editor-session')).toBeNull();
});
it('rejects invalid editor context before network activity and retains strict operation bodies', async () => {
  const fetcher = vi.fn<typeof fetch>();
  const client = createApiClient({ ...config, fetch: fetcher });
  for (const value of [
    '',
    'invalid',
    '00000000-0000-0000-0000-000000000000',
    `${editorSessionId}\n`,
  ]) {
    const options = { idempotencyKey: 'editor-session-invalid-123', editorSessionId: value };
    await expect(
      client.call(
        'documents.update',
        { collection: 'articles', id, revision: 1, data: { title: 'Editor' } },
        options,
      ),
    ).rejects.toBeDefined();
  }
  await expect(
    client.call('documents.update', {
      collection: 'articles',
      id,
      revision: 1,
      data: { title: 'Editor' },
      editorSessionId,
    }),
  ).rejects.toBeDefined();
  expect(fetcher).not.toHaveBeenCalled();
});

it('regression: update alternatives enforce their common object shape, field types, required mutation and unknown-key rejection', () => {
  const target = { collection: 'articles', id, revision: 1 };
  for (const patch of [
    { data: { title: 'Valid' } },
    { uploadId: id },
    { folderId: null },
    { dataByLocale: { en: { title: 'Valid' } } },
  ])
    expect(validateInput('documents.update', { ...target, ...patch })).toMatchObject(target);
  for (const input of [
    { ...target },
    { ...target, revision: '1', data: { title: 'Wrong revision' } },
    { ...target, data: {} },
    { ...target, data: [] },
    { ...target, data: { title: 'Valid' }, unknown: true },
    { id, revision: 1, data: { title: 'Missing collection' } },
  ])
    expect(() => validateInput('documents.update', input)).toThrow(Error);
});
