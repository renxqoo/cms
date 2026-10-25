import { Dashboard } from '../../../features/session/dashboard';
import { requireSession } from '../../../server/require-session';

export default async function DashboardPage() {
  const principal = await requireSession();
  return <Dashboard principal={principal} />;
}
