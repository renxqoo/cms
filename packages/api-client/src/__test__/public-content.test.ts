import { expect, it, vi } from 'vitest';
import { png } from '../../../../test/support/png.ts';
import { createApiClient } from '../client.ts';
import { validateInput } from '../operations.ts';

const bindingId = '11111111-1111-4111-8111-111111111111';
const configuration = {
  origin: 'https://cms.example',
  timeoutMs: 1000,
  maxResponseBytes: 16,
  maxFileBytes: 4096,
};

it.each(['publicContent.media', 'previewContent.media'])(
  'downloads an actual PNG unchanged through %s instead of parsing it as JSON',
  async (operation) => {
    const bytes = new Uint8Array(png([20, 100, 180]));
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(bytes, { headers: { 'content-type': 'image/png' } }));
    const preview = operation.startsWith('previewContent.');
    const client = createApiClient({
      ...configuration,
      maxResponseBytes: 4096,
      ...(preview ? { token: 'explicit-preview-grant' } : {}),
      fetch: fetcher,
    });
    await expect(client.call(operation, { bindingId })).resolves.toEqual({
      data: bytes,
      bytes: bytes.byteLength,
      filename: 'download',
      mimeType: 'image/png',
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('authorization')).toBe(
      preview ? 'Bearer explicit-preview-grant' : null,
    );
  },
);

it.each([
  ['publicContent.index', { kind: 'documents', locale: 'en' }],
  ['publicContent.sitemap', {}],
] as const)(
  'returns %s as bounded raw NDJSON bytes without claiming export validation',
  async (operation, input) => {
    const source = '{"type":"start"}\n{"type":"item","data":{"title":"模型"}}\n';
    const bytes = new TextEncoder().encode(source);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(bytes, { headers: { 'content-type': 'application/x-ndjson' } }),
      );
    const client = createApiClient({ ...configuration, fetch: fetcher });
    await expect(client.call(operation, input)).resolves.toEqual({
      data: bytes,
      bytes: bytes.byteLength,
      filename: 'download',
      mimeType: 'application/x-ndjson',
    });
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
  },
);

it('rejects oversized public downloads under the file budget without retrying', async () => {
  const cancel = vi.fn<() => void>();
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(9));
        },
        cancel,
      }),
      { headers: { 'content-type': 'image/png' } },
    ),
  );
  const client = createApiClient({ ...configuration, maxFileBytes: 8, fetch: fetcher });
  await expect(client.call('publicContent.media', { bindingId })).rejects.toMatchObject({
    code: 'payload_too_large',
    status: 413,
  });
  expect(cancel).toHaveBeenCalledOnce();
  expect(fetcher).toHaveBeenCalledOnce();
});

it('reads the public interface without a credential and validates required input before network access', async () => {
  const value = { contractVersion: 'oneaster-public.v1', data: { initialized: true } };
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(value));
  const client = createApiClient({ ...configuration, maxResponseBytes: 4096, fetch: fetcher });
  await expect(
    client.call('publicContent.interface', {
      locale: 'en',
      messageContractVersion: 'oneaster-ui.v5',
    }),
  ).resolves.toEqual(value);
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false);
  await expect(client.call('publicContent.interface', { locale: 'en' })).rejects.toThrow(
    'messageContractVersion',
  );
  expect(fetcher).toHaveBeenCalledOnce();
});

it.each([
  [
    'languages.setDefault',
    { collection: 'languages', id: bindingId, revision: 2, expectedDefaultCode: 'en' },
  ],
  [
    'documents.createPreviewTicket',
    { collection: 'models', id: bindingId, expectedRevision: 2, locale: 'en' },
  ],
  ['documents.revokePreviewTicket', { collection: 'models', id: bindingId, ticketId: bindingId }],
  ['publicContent.interface', { locale: 'en', messageContractVersion: 'oneaster-ui.v5' }],
  ['publicContent.home', { locale: 'en' }],
  ['publicContent.models', { locale: 'en', page: '2' }],
  ['publicContent.integrations', { slug: 'model', locale: 'en' }],
  ['publicContent.model', { slug: 'model', locale: 'en' }],
  ['publicContent.documents', { locale: 'en' }],
  ['publicContent.document', { slug: 'getting-started', locale: 'en' }],
  ['publicContent.index', { kind: 'documents', locale: 'en' }],
  ['publicContent.sitemap', {}],
  ['publicContent.media', { bindingId }],
  ['previewContent.integrations', { slug: 'model', locale: 'en' }],
  ['previewContent.model', { slug: 'model', locale: 'en' }],
  ['previewContent.media', { bindingId }],
  ['previewContent.revoke', {}],
] as const)('accepts the actual request fields for %s', (operation, input) => {
  expect(validateInput(operation, input)).toEqual(input);
});
