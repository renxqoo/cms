import { DocumentEditorPage } from '../../../../../../features/collections/editor-page';
import { requireSession } from '../../../../../../server/require-session';

export default async function Page({
  params,
}: {
  params: Promise<{ collection: string; id: string }>;
}) {
  await requireSession();
  const { collection, id } = await params;
  return <DocumentEditorPage collectionKey={collection} documentId={id} />;
}
