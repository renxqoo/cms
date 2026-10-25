'use client';

import type { ReactNode } from 'react';
import { LanguagesIcon, MoonIcon, SunIcon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { useShell } from '../../components/shell/shell-provider';
import { appConfig } from '../../config/app';
import { ClientInteractionBoundary } from '../../components/client-interaction-boundary';
import { authMessages } from './auth-messages';

export function AuthLayout({ children }: { children: ReactNode }) {
  const locale = useShell((state) => state.locale);
  const theme = useShell((state) => state.theme);
  const setLocale = useShell((state) => state.setLocale);
  const setTheme = useShell((state) => state.setTheme);
  const t = authMessages[locale];

  return (
    <ClientInteractionBoundary
      as="main"
      className="relative flex min-h-svh flex-col items-center justify-center bg-background px-4 pt-24 pb-10 text-foreground"
    >
      <div className="absolute top-5 right-4 flex items-center gap-2 sm:top-6 sm:right-6">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t.theme}
          aria-pressed={theme === 'dark'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t.locale}
          onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
        >
          <LanguagesIcon />
          <span className="text-xs font-semibold">{locale === 'zh' ? '中' : 'EN'}</span>
        </Button>
      </div>
      <div className="flex w-full max-w-[370px] flex-col items-center gap-8">
        <p className="text-xl font-semibold tracking-tight">{appConfig.name}</p>
        {children}
      </div>
    </ClientInteractionBoundary>
  );
}
