import 'server-only';
import { cache } from 'react';
import { notFound } from 'next/navigation';
import { readCollectionPresentation } from './collection-presentation';
import type { CollectionPresentationInput } from './collection-presentation';
export const readRegisteredView = cache(async function readRegisteredView(
  collection: string,
  scopePath: string,
  options: Omit<CollectionPresentationInput, 'collection'> = {},
) {
  const { collection: catalog } = await readCollectionPresentation({ collection, ...options });
  const separator = scopePath.indexOf(':');
  const scope = scopePath.slice(0, separator);
  const path = scopePath.slice(separator + 1);
  const view = catalog.admin?.views?.find((entry) => entry.scope === scope && entry.path === path);
  if (!view || (scope === 'document' && !options.documentId)) notFound();
  return view;
});
