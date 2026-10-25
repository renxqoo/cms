import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { appConfig } from '../../../config/app';
import { parsePreferences, preferenceConfig } from '../../../config/preferences';
import { recoveryMessages } from '../../../features/auth/recovery-messages';
import { PasswordActionForm } from '../../../features/auth/password-action-form';

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const { locale } = parsePreferences({
    locale: store.get(preferenceConfig.cookies.locale)?.value,
  });
  return { title: `${appConfig.name} — ${recoveryMessages[locale].inviteTitle}` };
}

export default function Page() {
  return <PasswordActionForm key="invitation" kind="invitation" />;
}
