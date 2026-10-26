import { DocumentListPage } from '../../../../../features/collections/list-page';
import { requireSession } from '../../../../../server/require-session';

export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  await requireSession();
  const { collection } = await params;
  return <DocumentListPage collectionKey={collection} />;
}
