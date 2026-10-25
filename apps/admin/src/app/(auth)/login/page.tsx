import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { appConfig } from '../../../config/app';
import { parsePreferences, preferenceConfig } from '../../../config/preferences';
import { authMessages } from '../../../features/auth/auth-messages';
import { LoginForm } from '../../../features/auth/login-form';
import { safeLoginNext } from '../../../features/auth/login-navigation';
import { getCurrentSession } from '../../../server/session';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const { locale } = parsePreferences({
    locale: cookieStore.get(preferenceConfig.cookies.locale)?.value,
  });
  return { title: `${appConfig.name} — ${authMessages[locale].title}` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const next = safeLoginNext(query.next);
  const session = await getCurrentSession();
  if (session.ok) redirect(next);
  return (
    <LoginForm
      next={next}
      expired={
        session.status === 401 &&
        (session.error.code !== 'session_missing' || query.reason === 'expired')
      }
      unavailable={session.status !== 401}
    />
  );
}
