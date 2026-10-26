import { EndpointsPage } from '../../../../features/endpoints/endpoints-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <EndpointsPage />;
}
