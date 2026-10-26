import { redirect } from 'next/navigation';
import { AuthorizePage } from '../../../features/credentials/authorize-page';
import { authorizationReturnPath } from '../../../features/credentials/authorization-navigation';
import { getCurrentSession } from '../../../server/session';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const requestId =
    typeof query.request === 'string' &&
    authorizationReturnPath(`/authorize?request=${query.request}`)
      ? query.request
      : null;
  if (!requestId) return <AuthorizePage requestId={null} />;
  const session = await getCurrentSession();
  if (!session.ok) {
    const next = `/authorize?request=${requestId}`;
    const search = new URLSearchParams({ next });
    if (session.status !== 401) search.set('reason', 'unavailable');
    else if (session.error.code !== 'session_missing') search.set('reason', 'expired');
    redirect(`/login?${search}`);
  }
  return <AuthorizePage key={requestId} requestId={requestId} email={session.data.email} />;
}
