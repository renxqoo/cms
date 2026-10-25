'use client';

import { LanguagesIcon, MoonIcon, PanelLeftIcon, SunIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@new-cms/ui/actions';
import { appConfig } from '../../config/app';
import { useShell } from './shell-provider';
import { useShellSurface } from './shell-surface';
import { RouteBreadcrumbs } from './route-breadcrumbs';
import { NavigationProgress } from './navigation-progress';

export function ShellHeader() {
  const t = useTranslations('shell');
  const surface = useShellSurface();
  const locale = useShell((state) => state.locale);
  const theme = useShell((state) => state.theme);
  const setLocale = useShell((state) => state.setLocale);
  const setTheme = useShell((state) => state.setTheme);
  const toggleSidebar = useShell((state) => state.toggleSidebar);
  const setMobileOpen = useShell((state) => state.setMobileOpen);

  function toggleNavigation() {
    if (window.matchMedia(appConfig.navigationBreakpoint).matches) toggleSidebar();
    else setMobileOpen(true);
  }

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center bg-background/85 backdrop-blur-md supports-backdrop-filter:bg-background/70">
      <NavigationProgress />
      <div className="flex w-full items-center justify-between px-5 md:px-6 lg:px-8 xl:px-10">
        <div className="flex items-center gap-1 lg:gap-2">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('toggleSidebar')}
            onClick={toggleNavigation}
            className="-ml-1"
          >
            <PanelLeftIcon />
          </Button>
          <span className="mx-2 h-4 w-px bg-border" aria-hidden="true" />
          <div className="hidden min-w-0 items-center sm:flex">
            <RouteBreadcrumbs />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('theme')}
            aria-pressed={theme === 'dark'}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          >
            {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('locale')}
            onClick={() => setLocale(locale === 'zh' ? 'en' : 'zh')}
          >
            <LanguagesIcon />
            <span className="text-xs font-semibold">{locale === 'zh' ? '中' : 'EN'}</span>
          </Button>
          {surface ? (
            surface.account
          ) : (
            <span
              className="flex size-8 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground ring-1 ring-border/50"
              title={t('workbench')}
              aria-label={t('workbench')}
            >
              OA
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
