import {
  collectionRouteMetadata,
  collectionRouteViewport,
} from '../../../../../server/collection-route-presentation';
import type { CollectionRouteParameters } from '../../../../../server/collection-route-presentation';
import { DocumentListPage } from '../../../../../features/collections/list-page';
import { requireSession } from '../../../../../server/require-session';

export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  await requireSession();
  const { collection } = await params;
  return <DocumentListPage collectionKey={collection} />;
}

export async function generateMetadata(input: CollectionRouteParameters) {
  return collectionRouteMetadata(input);
}
export async function generateViewport(input: CollectionRouteParameters) {
  return collectionRouteViewport(input);
}
