import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { appConfig } from '../config/app';
import { parsePreferences, preferenceConfig } from '../config/preferences';
import { messages } from '../i18n/messages';
import { ShellProvider } from '../components/shell/shell-provider';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const cookieStore = await cookies();
  const { locale } = parsePreferences({
    locale: cookieStore.get(preferenceConfig.cookies.locale)?.value,
  });
  return {
    title: `${appConfig.name} — ${messages[locale].shell.workbench}`,
    description: messages[locale].overview.description,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initial = parsePreferences({
    locale: cookieStore.get(preferenceConfig.cookies.locale)?.value,
    theme: cookieStore.get(preferenceConfig.cookies.theme)?.value,
    sidebar: cookieStore.get(preferenceConfig.cookies.sidebar)?.value,
    groups: cookieStore.get(preferenceConfig.cookies.groups)?.value,
  });
  return (
    <html
      lang={initial.locale === 'zh' ? 'zh-CN' : 'en'}
      className={initial.theme === 'dark' ? 'dark' : undefined}
      style={{ colorScheme: initial.theme }}
    >
      <body className="min-h-screen antialiased">
        <ShellProvider initial={initial}>{children}</ShellProvider>
      </body>
    </html>
  );
}
