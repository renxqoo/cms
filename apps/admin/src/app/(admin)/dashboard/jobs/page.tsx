import { JobsPage } from '../../../../features/jobs/jobs-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <JobsPage />;
}
