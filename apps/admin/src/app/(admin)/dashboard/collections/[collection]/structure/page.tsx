import { requireSession } from '../../../../../../server/require-session';
import { CollectionStructure } from '../../../../../../features/collections/collection-structure';
import { notFound } from 'next/navigation';
export default async function Page({ params }: { params: Promise<{ collection: string }> }) {
  await requireSession();
  const values = await params;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(values.collection)) notFound();
  return <CollectionStructure collection={values.collection} />;
}
