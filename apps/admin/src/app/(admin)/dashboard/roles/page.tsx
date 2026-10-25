import { RolesPage } from '../../../../features/roles/roles-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <RolesPage />;
}
