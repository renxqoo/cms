import { CredentialsPage } from '../../../../../features/credentials/credentials-page';
import { requireSession } from '../../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <CredentialsPage />;
}
