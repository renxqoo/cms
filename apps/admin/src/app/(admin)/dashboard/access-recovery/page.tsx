import { RecoveryPage } from '../../../../features/endpoints/recovery-page';
import { requireSession } from '../../../../server/require-session';
export default async function Page() {
  await requireSession();
  return <RecoveryPage />;
}
