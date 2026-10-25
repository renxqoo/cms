import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AdminDetailPage } from '../../../../../features/admins/admin-detail-page';
import { requireSession } from '../../../../../server/require-session';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <AdminDetailPage id={id} />;
}
