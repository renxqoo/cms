'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ShellHeader } from './shell-header';
import { ShellSidebar } from './shell-sidebar';
import { MobileSidebar } from './mobile-sidebar';
import { useShell } from './shell-provider';
import { AppNavigationProvider } from './navigation/provider';
import { LoadingProvider, ToastProvider } from '@new-cms/ui/feedback';

export function AppShell({ children }: { children: ReactNode }) {
  const open = useShell((state) => state.sidebarOpen);
  const theme = useShell((state) => state.theme);
  const t = useTranslations('shell');
  return (
    <LoadingProvider>
      <ToastProvider theme={theme} closeLabel={t('close')} label={t('notifications')}>
        <AppNavigationProvider>
          <div className="flex min-h-svh w-full bg-sidebar">
            <a
              href="#main-content"
              className="fixed top-2 left-2 z-100 -translate-y-20 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:translate-y-0"
            >
              {t('skip')}
            </a>
            <div
              className={`hidden shrink-0 transition-[width] duration-200 motion-reduce:transition-none md:block ${open ? 'w-72' : 'w-16'}`}
            >
              <ShellSidebar collapsed={!open} />
            </div>
            <MobileSidebar />
            <div className="relative flex min-w-0 flex-1 flex-col bg-background">
              <ShellHeader />
              <main
                id="main-content"
                tabIndex={-1}
                className="min-h-0 min-w-0 flex-1 px-5 py-5 outline-none md:px-6 md:py-6 lg:px-8 xl:px-10"
              >
                {children}
              </main>
            </div>
          </div>
        </AppNavigationProvider>
      </ToastProvider>
    </LoadingProvider>
  );
}
