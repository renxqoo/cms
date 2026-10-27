import { beforeAll, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  metadataCollection,
  metadataDocument,
} from '../../../../../test/support/admin-metadata-data';
import { collectionOGImage } from '../collection-og-image';
import type { readCollectionMetadataContext } from '../collection-page-metadata';
const state = vi.hoisted(() => ({ read: vi.fn<typeof readCollectionMetadataContext>() }));
vi.mock('../collection-page-metadata', () => ({ readCollectionMetadataContext: state.read }));
beforeAll(async () => {
  await promisify(execFile)(process.execPath, [
    resolve(import.meta.dirname, '../../../../../tooling/prepare-admin-og.ts'),
  ]);
});
beforeEach(() => {
  vi.spyOn(process, 'cwd').mockReturnValue(resolve(import.meta.dirname, '../../..'));
  state.read.mockReset();
  state.read.mockResolvedValue({
    presentation: { collection: metadataCollection, document: metadataDocument },
    metadata: {},
    title: '私有文章标题 Chinese 文章 🌻',
  });
});
afterEach(() => vi.restoreAllMocks());
it('renders a real private Chinese PNG using only local font assets', async () => {
  const response = await collectionOGImage({
    collection: 'articles',
    documentId: metadataDocument.id,
    locale: 'zh',
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('image/png');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const dimensions = new DataView(bytes.buffer);
  expect(dimensions.getUint32(16)).toBe(1200);
  expect(dimensions.getUint32(20)).toBe(630);
  await writeFile('/tmp/cms-private-og-zh.png', bytes);
});
it('denied and disabled images return no private image body and always forbid shared caching', async () => {
  state.read.mockRejectedValueOnce(new Error('Denied'));
  const denied = await collectionOGImage({ collection: 'articles' });
  expect(denied.status).toBe(404);
  expect(await denied.text()).toBe('');
  expect(denied.headers.get('cache-control')).toBe('private, no-store');
  state.read.mockResolvedValue({
    presentation: { collection: metadataCollection, document: null },
    metadata: { defaultOGImageType: 'off' },
    title: 'Private',
  });
  const disabled = await collectionOGImage({ collection: 'articles' });
  expect(disabled.status).toBe(404);
  expect(await disabled.text()).toBe('');
});
it('cancellation terminates active workers and releases render capacity for the next private request', async () => {
  const first = new AbortController();
  const second = new AbortController();
  const one = collectionOGImage({ collection: 'articles', signal: first.signal });
  const two = collectionOGImage({ collection: 'articles', signal: second.signal });
  const overflow = await collectionOGImage({ collection: 'articles' });
  expect(overflow.status).toBe(503);
  first.abort();
  second.abort();
  expect((await one).status).toBe(503);
  expect((await two).status).toBe(503);
  const next = await collectionOGImage({ collection: 'articles' });
  expect(next.status).toBe(200);
  expect((await next.arrayBuffer()).byteLength).toBeGreaterThan(8);
});
