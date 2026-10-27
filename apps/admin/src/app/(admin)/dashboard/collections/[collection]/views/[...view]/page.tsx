import {
  collectionRouteMetadata,
  collectionRouteViewport,
} from '../../../../../../../server/collection-route-presentation';
import type { CollectionRouteParameters } from '../../../../../../../server/collection-route-presentation';
import { readRegisteredView } from '../../../../../../../server/collection-views';
import { DocumentListPage } from '../../../../../../../features/collections/list-page';

interface Parameters {
  params: Promise<{ collection: string; view: string[] }>;
}
export default async function Page({ params }: Parameters) {
  const { collection, view } = await params;
  await readRegisteredView(collection, `collection:${view.join('/')}`);
  return <DocumentListPage collectionKey={collection} viewPath={view.join('/')} />;
}

export async function generateMetadata(input: CollectionRouteParameters) {
  return collectionRouteMetadata(input);
}
export async function generateViewport(input: CollectionRouteParameters) {
  return collectionRouteViewport(input);
}
