import { beforeEach, expect, it, vi } from 'vitest';
import { GET } from '../../app/api/admin/collections/[collection]/og/route';
import { collectionOGImage } from '../collection-og-image';
vi.mock('../collection-og-image', () => ({
  collectionOGImage: vi.fn<typeof collectionOGImage>(),
  privateImageHeaders: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
}));
const image = vi.mocked(collectionOGImage);
const params = { params: Promise.resolve({ collection: 'articles' }) };
beforeEach(() => {
  image
    .mockReset()
    .mockResolvedValue(
      new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }),
    );
});
it.each([
  'unknown=x',
  'locale=en&locale=zh',
  'id=one&id=one',
  'view=review',
  'view=review&scope=unregistered',
])(
  'rejects ambiguous or unregistered image query without invoking private rendering: %s',
  async (query) => {
    const response = await GET(new Request(`https://admin.example.test/og?${query}`), params);
    expect(response.status).toBe(400);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.text()).toBe('');
    expect(image).not.toHaveBeenCalled();
  },
);
it.each(['document', 'collection'])(
  'passes an exact custom-view scope and live request cancellation: %s',
  async (scope) => {
    const request = new Request(
      `https://admin.example.test/og?locale=zh&id=document&view=review%2Fsummary&scope=${scope}`,
    );
    expect((await GET(request, params)).status).toBe(200);
    expect(image.mock.calls[0]?.[0]).toEqual({
      collection: 'articles',
      documentId: 'document',
      locale: 'zh',
      view: { scope, path: 'review/summary' },
      signal: request.signal,
    });
  },
);
it('collection image requests omit absent locale, document, and view values', async () => {
  const request = new Request('https://admin.example.test/og');
  expect((await GET(request, params)).status).toBe(200);
  expect(image.mock.calls[0]?.[0]).toEqual({ collection: 'articles', signal: request.signal });
});
