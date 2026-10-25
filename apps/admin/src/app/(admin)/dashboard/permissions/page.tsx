import { PermissionsPage } from '../../../../features/permissions/permissions-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <PermissionsPage />;
}
