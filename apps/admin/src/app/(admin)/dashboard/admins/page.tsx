import { AdminsListPage } from '../../../../features/admins/admins-list-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <AdminsListPage />;
}
