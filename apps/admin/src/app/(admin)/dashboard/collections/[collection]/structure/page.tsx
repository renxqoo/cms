import { CollectionStructurePage } from '../../../../../../features/collections/structure-page';
import { requireSession } from '../../../../../../server/require-session';

export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  await requireSession();
  const { collection } = await params;
  return <CollectionStructurePage collectionKey={collection} />;
}
