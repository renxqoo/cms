import { beforeEach, expect, it, vi } from 'vitest';
import {
  metadataCollection,
  metadataDocument,
} from '../../../../../test/support/admin-metadata-data';
import { readCollectionPresentation } from '../collection-presentation';
import { collectionPageMetadata, readCollectionMetadataContext } from '../collection-page-metadata';
import {
  collectionRouteInput,
  collectionRouteMetadata,
  collectionRouteViewport,
} from '../collection-route-presentation';
import { z } from 'zod';
import type { Collection } from '../../contracts/content';
vi.mock('../collection-presentation', () => ({
  readCollectionPresentation: vi.fn<typeof readCollectionPresentation>(),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('Missing view');
  },
}));
const read = vi.mocked(readCollectionPresentation);
function configured(
  meta: NonNullable<Collection['admin']>['meta'],
  views?: NonNullable<Collection['admin']>['views'],
) {
  const collection = {
    ...metadataCollection,
    admin: { ...metadataCollection.admin, meta, ...(views ? { views } : {}) },
  };
  read.mockResolvedValue({ collection, document: metadataDocument });
}
beforeEach(() => {
  vi.clearAllMocks();
  read.mockResolvedValue({ collection: metadataCollection, document: metadataDocument });
});
it('uses authorized document titles and description with locale and custom-view image URLs', async () => {
  configured({ titleSuffix: ' — 管理', robots: { index: false } }, [
    {
      id: 'summary',
      path: 'review/summary',
      scope: 'document',
      label: 'Review',
      component: { id: 'review', props: {} },
    },
  ]);
  const result = await collectionRouteMetadata({
    params: Promise.resolve({
      collection: 'articles',
      id: metadataDocument.id,
      view: ['review', 'summary'],
    }),
    searchParams: Promise.resolve({ locale: 'zh' }),
  });
  expect(result.title).toBe('私有文章标题 — 管理');
  expect(result.description).toBe('只使用当前用户有权读取的内容');
  expect(result.robots).toEqual({ index: false });
  expect(result.openGraph).toMatchObject({
    images: [{ alt: '私有文章标题', width: 1200, height: 630 }],
  });
  const graph = z
    .object({ images: z.array(z.object({ url: z.string() })) })
    .parse(result.openGraph);
  const url = new URL(graph.images[0]?.url ?? '');
  expect(url.pathname).toBe('/api/admin/collections/articles/og');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    locale: 'zh',
    id: metadataDocument.id,
    view: 'review/summary',
    scope: 'document',
  });
});
it('uses collection or view titles without a document and merges configured view metadata', async () => {
  const collection = {
    ...metadataCollection,
    admin: {
      ...metadataCollection.admin,
      meta: { titleSuffix: ' — CMS', defaultOGImageType: 'off' },
      views: [
        {
          id: 'review',
          path: 'review',
          scope: 'collection' as const,
          label: 'Review queue',
          component: { id: 'review', props: {} },
          meta: { description: 'Review description' },
        },
      ],
    },
  };
  read.mockResolvedValue({ collection, document: null });
  expect((await collectionPageMetadata({ collection: 'articles' })).title).toBe('文章 — CMS');
  const result = await collectionPageMetadata({
    collection: 'articles',
    view: { scope: 'collection', path: 'review' },
  });
  expect(result.title).toBe('Review queue — CMS');
  expect(result.description).toBe('Review description');
  expect(result.openGraph).toBeUndefined();
});
it.each([null, { images: [] }, { images: [{ url: 'https://example.test/cover.png' }] }])(
  'preserves explicit Open Graph images or null: %j',
  async (openGraph) => {
    configured({ title: { absolute: 'Explicit title' }, openGraph });
    const result = await collectionPageMetadata({ collection: 'articles' });
    expect(result.title).toEqual({ absolute: 'Explicit title' });
    expect(result.openGraph).toEqual(openGraph);
  },
);
it('unknown custom views return no metadata and failures preserve the access decision', async () => {
  await expect(
    readCollectionMetadataContext({
      collection: 'articles',
      view: { scope: 'document', path: 'unknown' },
    }),
  ).rejects.toThrow('Missing view');
  read.mockRejectedValueOnce(new Error('Denied'));
  await expect(collectionPageMetadata({ collection: 'articles' })).rejects.toThrow('Denied');
});
it('only accepts a single locale and resolves collection custom-view route parameters', async () => {
  expect(
    await collectionRouteInput({
      params: Promise.resolve({ collection: 'articles', view: ['review'] }),
      searchParams: Promise.resolve({ locale: ['zh', 'en'] }),
    }),
  ).toEqual({ collection: 'articles', view: { scope: 'collection', path: 'review' } });
  expect(
    await collectionRouteInput({ params: Promise.resolve({ collection: 'articles' }) }),
  ).toEqual({ collection: 'articles' });
});
it('consumes viewport objects and legacy string values through the Next viewport API', async () => {
  configured({
    viewport:
      'width=device-width, height=900,initial-scale=1,minimum-scale=0.5,maximum-scale=3,user-scalable=no,viewport-fit=cover,interactive-widget=resizes-content,unknown=yes,invalid',
    themeColor: '#ffffff',
    colorScheme: 'light',
  });
  const input = { params: Promise.resolve({ collection: 'articles' }) };
  expect(await collectionRouteViewport(input)).toEqual({
    width: 'device-width',
    height: 900,
    initialScale: 1,
    minimumScale: 0.5,
    maximumScale: 3,
    userScalable: false,
    viewportFit: 'cover',
    interactiveWidget: 'resizes-content',
    themeColor: '#ffffff',
    colorScheme: 'light',
  });
  configured({ viewport: { width: 'device-width', initialScale: 2 } });
  expect(await collectionRouteViewport(input)).toEqual({ width: 'device-width', initialScale: 2 });
  configured({ viewport: 'user-scalable=yes' });
  expect(await collectionRouteViewport(input)).toEqual({ userScalable: true });
  configured({ viewport: null });
  expect(await collectionRouteViewport(input)).toEqual({});
});
