import { NavigationPage } from '../../../../features/navigation/navigation-page';
import { requireSession } from '../../../../server/require-session';

export default async function Page() {
  await requireSession();
  return <NavigationPage />;
}
