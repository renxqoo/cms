import { CleanupsPage } from '../../../../features/asset-cleanups/cleanups-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <CleanupsPage />;
}
