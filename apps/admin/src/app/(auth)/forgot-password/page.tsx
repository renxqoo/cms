import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { appConfig } from '../../../config/app';
import { parsePreferences, preferenceConfig } from '../../../config/preferences';
import { recoveryMessages } from '../../../features/auth/recovery-messages';
import { ForgotPasswordForm } from '../../../features/auth/forgot-password-form';

export async function generateMetadata(): Promise<Metadata> {
  const store = await cookies();
  const { locale } = parsePreferences({
    locale: store.get(preferenceConfig.cookies.locale)?.value,
  });
  return { title: `${appConfig.name} — ${recoveryMessages[locale].forgotTitle}` };
}

export default function Page() {
  return <ForgotPasswordForm />;
}
