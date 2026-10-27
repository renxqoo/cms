import {
  collectionRouteMetadata,
  collectionRouteViewport,
} from '../../../../../../../../server/collection-route-presentation';
import type { CollectionRouteParameters } from '../../../../../../../../server/collection-route-presentation';
import { readRegisteredView } from '../../../../../../../../server/collection-views';
import { DocumentEditorPage } from '../../../../../../../../features/collections/editor-page';

interface Parameters {
  params: Promise<{ collection: string; id: string; view: string[] }>;
}
export default async function Page({ params }: Parameters) {
  const { collection, view, id } = await params;
  await readRegisteredView(collection, `document:${view.join('/')}`, { documentId: id });
  return (
    <DocumentEditorPage collectionKey={collection} documentId={id} viewPath={view.join('/')} />
  );
}

export async function generateMetadata(input: CollectionRouteParameters) {
  return collectionRouteMetadata(input);
}
export async function generateViewport(input: CollectionRouteParameters) {
  return collectionRouteViewport(input);
}
