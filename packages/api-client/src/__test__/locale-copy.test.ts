import { expect, it, vi } from 'vitest';
import { createApiClient } from '../client.ts';

it('serializes the registered locale-copy body and idempotency key without allowing all-locales input through the generated schema', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({}));
  const client = createApiClient({
    origin: 'https://cms.example',
    token: 'test-private-token',
    timeoutMs: 1000,
    maxResponseBytes: 4096,
    maxFileBytes: 4096,
    fetch: fetcher,
  });
  const id = '10000000-0000-4000-8000-000000000001';
  await client.call(
    'documents.copyLocale',
    {
      collection: 'articles',
      id,
      revision: 7,
      fromLocale: 'en',
      toLocale: 'zh-CN',
      overwrite: true,
    },
    { idempotencyKey: 'locale-copy-request-123' },
  );
  const [url, request] = fetcher.mock.calls[0] ?? [];
  expect(url).toBe(`https://cms.example/v1/collections/articles/documents/${id}/locale-copies`);
  expect(request?.method).toBe('POST');
  expect(request?.body).toBe(
    JSON.stringify({ revision: 7, fromLocale: 'en', toLocale: 'zh-CN', overwrite: true }),
  );
  expect(new Headers(request?.headers).get('idempotency-key')).toBe('locale-copy-request-123');
  await expect(
    client.call(
      'documents.copyLocale',
      { collection: 'articles', id, revision: 7, fromLocale: 'all', toLocale: 'zh-CN' },
      { idempotencyKey: 'invalid-locale-copy-123' },
    ),
  ).rejects.toMatchObject({ issues: [{ path: ['fromLocale'] }] });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
