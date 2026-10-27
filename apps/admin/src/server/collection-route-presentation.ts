import 'server-only';
import type { Viewport } from 'next';
import { collectionPageMetadata, readCollectionMetadataContext } from './collection-page-metadata';
export interface CollectionRouteParameters {
  params: Promise<{ collection: string; id?: string; view?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}
export async function collectionRouteInput(input: CollectionRouteParameters) {
  const [params, search] = await Promise.all([input.params, input.searchParams]);
  const locale = typeof search?.['locale'] === 'string' ? search['locale'] : undefined;
  return {
    collection: params.collection,
    ...(params.id ? { documentId: params.id } : {}),
    ...(locale ? { locale } : {}),
    ...(params.view
      ? {
          view: {
            scope: params.id ? ('document' as const) : ('collection' as const),
            path: params.view.join('/'),
          },
        }
      : {}),
  };
}
export async function collectionRouteMetadata(input: CollectionRouteParameters) {
  return collectionPageMetadata(await collectionRouteInput(input));
}
export async function collectionRouteViewport(input: CollectionRouteParameters): Promise<Viewport> {
  const { metadata } = await readCollectionMetadataContext(await collectionRouteInput(input));
  const result: Viewport = {};
  Object.assign(result, viewportValues(metadata['viewport']));
  if (metadata['themeColor'] !== undefined)
    Object.assign(result, { themeColor: metadata['themeColor'] });
  if (metadata['colorScheme'] !== undefined)
    Object.assign(result, { colorScheme: metadata['colorScheme'] });
  return result;
}

function viewportValues(value: unknown): object {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  const names: Record<string, string> = {
    width: 'width',
    height: 'height',
    'initial-scale': 'initialScale',
    'minimum-scale': 'minimumScale',
    'maximum-scale': 'maximumScale',
    'user-scalable': 'userScalable',
    'viewport-fit': 'viewportFit',
    'interactive-widget': 'interactiveWidget',
  };
  const result: Record<string, string | number | boolean> = {};
  for (const item of value.split(',')) {
    const [rawKey, rawValue] = item.split('=');
    if (!rawKey || !rawValue) continue;
    const key = names[rawKey.trim()];
    const entry = rawValue.trim();
    if (!key) continue;
    result[key] = viewportValue(key, entry);
  }
  return result;
}

function viewportValue(key: string, value: string): string | number | boolean {
  if (key === 'userScalable') return !['no', '0', 'false'].includes(value);
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}
