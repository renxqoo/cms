import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { metadataCollection } from '../../../../../test/support/admin-metadata-data';
import { collectionOGImage } from '../collection-og-image';
import type { readCollectionMetadataContext } from '../collection-page-metadata';
import type { renderCollectionOG } from '../collection-og-render';
const state = vi.hoisted(() => ({
  read: vi.fn<typeof readCollectionMetadataContext>(),
  render: vi.fn<typeof renderCollectionOG>(),
}));
vi.mock('../collection-page-metadata', () => ({ readCollectionMetadataContext: state.read }));
vi.mock('../collection-og-render', () => ({ renderCollectionOG: state.render }));
vi.mock('../config', () => ({ loadAdminConfig: () => ({ requestTimeoutMs: 10 }) }));
beforeEach(() => {
  state.read.mockReset().mockResolvedValue({
    presentation: { collection: metadataCollection, document: null },
    metadata: {},
    title: 'Authorized private title',
  });
  state.render
    .mockReset()
    .mockResolvedValue(
      new Response(new Uint8Array([1]), { headers: { 'Content-Type': 'image/png' } }),
    );
});
afterEach(() => {
  vi.useRealTimers();
});
it('static image configuration uses only the application identity and no document description', async () => {
  state.read.mockResolvedValue({
    presentation: { collection: metadataCollection, document: null },
    metadata: { defaultOGImageType: 'static' },
    title: 'Authorized private title',
  });
  expect((await collectionOGImage({ collection: 'articles' })).status).toBe(200);
  expect(state.render.mock.calls[0]?.[0]).toMatchObject({
    title: 'OneAster',
    description: '',
    brand: 'OneAster',
  });
});
it('renderer errors return private unavailable bodies and release capacity', async () => {
  state.render.mockRejectedValueOnce(new Error('Worker creation failed'));
  const failed = await collectionOGImage({ collection: 'articles' });
  expect(failed.status).toBe(503);
  expect(failed.headers.get('cache-control')).toBe('private, no-store');
  expect(await failed.text()).toBe('');
  expect((await collectionOGImage({ collection: 'articles' })).status).toBe(200);
});
it('already cancelled authorization does not confuse cancellation with document absence', async () => {
  const cancellation = new AbortController();
  cancellation.abort();
  state.read.mockRejectedValueOnce(new Error('Aborted'));
  const response = await collectionOGImage({ collection: 'articles', signal: cancellation.signal });
  expect(response.status).toBe(503);
  expect(state.render).not.toHaveBeenCalled();
});
it('the request deadline reaches the renderer and a later request can render', async () => {
  vi.useFakeTimers();
  state.render.mockImplementationOnce(
    ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(new Response(null, { status: 503 })), {
          once: true,
        });
      }),
  );
  const result = collectionOGImage({ collection: 'articles' });
  await vi.advanceTimersByTimeAsync(11);
  const response = await result;
  expect(response.status).toBe(503);
  expect(response.headers.get('vary')).toBe('Cookie');
  expect((await collectionOGImage({ collection: 'articles' })).status).toBe(200);
  expect(vi.getTimerCount()).toBe(0);
});
