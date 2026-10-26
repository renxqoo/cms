import { AuditPage } from '../../../../features/audit/audit-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <AuditPage />;
}
