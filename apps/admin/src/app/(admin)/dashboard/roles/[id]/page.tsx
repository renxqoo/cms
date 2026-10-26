import { notFound } from 'next/navigation';
import { z } from 'zod';
import { RoleDetailPage } from '../../../../../features/roles/role-detail';
import { requireSession } from '../../../../../server/require-session';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  return <RoleDetailPage id={id} />;
}
