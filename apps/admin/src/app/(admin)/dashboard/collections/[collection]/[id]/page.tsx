import { requireSession } from '../../../../../../server/require-session';
import { DocumentEditorPage } from '../../../../../../features/collections/document-editor-page';
import { notFound } from 'next/navigation';
import { z } from 'zod';
export default async function Page({
  params,
}: {
  params: Promise<{ collection: string; id: string }>;
}) {
  await requireSession();
  const values = await params;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(values.collection)) notFound();
  if (!z.uuid().safeParse(values.id).success) notFound();
  return <DocumentEditorPage collection={values.collection} id={values.id.toLowerCase()} />;
}
