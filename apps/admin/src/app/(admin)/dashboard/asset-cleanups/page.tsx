import { CleanupPage } from '../../../../features/assets/cleanup-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <CleanupPage />;
}
