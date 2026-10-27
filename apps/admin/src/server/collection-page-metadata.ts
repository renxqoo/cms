import { collectionOGPolicy } from './collection-og-policy';
import 'server-only';
import type { Metadata } from 'next';
import { readCollectionPresentation } from './collection-presentation';
import type { CollectionPresentationInput } from './collection-presentation';
import { notFound } from 'next/navigation';
import { documentTitle } from '../features/collections/query';
import { loadAdminConfig } from './config';

export interface CollectionMetadataInput extends CollectionPresentationInput {
  view?: { scope: 'collection' | 'document'; path: string };
}
export async function collectionPageMetadata(input: CollectionMetadataInput): Promise<Metadata> {
  const { presentation, metadata: configured, title } = await readCollectionMetadataContext(input);
  const {
    titleSuffix,
    defaultOGImageType: mode,
    themeColor: _theme,
    colorScheme: _scheme,
    viewport: _viewport,
    ...metadata
  } = configured;
  const result: Metadata = {
    title: `${title}${typeof titleSuffix === 'string' ? titleSuffix : ''}`,
    description: presentation.collection.admin?.description,
  };
  Object.assign(result, metadata);
  if (mode !== 'off') applyDefaultImage(result, input, title);
  return result;
}
function applyDefaultImage(
  metadata: Metadata,
  input: CollectionMetadataInput,
  title: string,
): void {
  if (metadata.openGraph === null || (metadata.openGraph && 'images' in metadata.openGraph)) return;
  const query = new URLSearchParams();
  if (input.locale) query.set('locale', input.locale);
  if (input.documentId) query.set('id', input.documentId);
  if (input.view) {
    query.set('view', input.view.path);
    query.set('scope', input.view.scope);
  }
  const relative = `/api/admin/collections/${encodeURIComponent(input.collection)}/og${query.size > 0 ? `?${query.toString()}` : ''}`;
  const url = new URL(relative, loadAdminConfig().adminOrigin).href;
  metadata.openGraph = {
    ...metadata.openGraph,
    images: [
      { url, alt: title, width: collectionOGPolicy.width, height: collectionOGPolicy.height },
    ],
  };
}

export async function readCollectionMetadataContext(input: CollectionMetadataInput) {
  const presentation = await readCollectionPresentation(input);
  const view = input.view
    ? presentation.collection.admin?.views?.find(
        (entry) => entry.scope === input.view?.scope && entry.path === input.view.path,
      )
    : undefined;
  if (input.view && !view) notFound();
  const metadata = { ...presentation.collection.admin?.meta, ...view?.meta };
  const title = presentation.document
    ? documentTitle(presentation.document, presentation.collection)
    : (view?.label ?? presentation.collection.label);
  return { presentation, metadata, title };
}
