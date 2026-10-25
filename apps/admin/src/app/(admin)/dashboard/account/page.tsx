import { AccountPage } from '../../../../features/account/account-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  const principal = await requireSession();
  return <AccountPage principal={principal} />;
}
