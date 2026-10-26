import { ResourcesPage } from '../../../../features/assets/resources-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <ResourcesPage />;
}
