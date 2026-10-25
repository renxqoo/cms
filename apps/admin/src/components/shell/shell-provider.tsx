'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { useStore } from 'zustand';
import type { StoreApi } from 'zustand';
import { preferenceConfig } from '../../config/preferences';
import type { ShellPreferences } from '../../config/preferences';
import { messages } from '../../i18n/messages';
import { createShellStore } from './shell-store';
import type { ShellState } from './shell-store';

const ShellContext = createContext<StoreApi<ShellState> | null>(null);

export function ShellProvider({
  initial,
  children,
}: {
  initial: ShellPreferences;
  children: ReactNode;
}) {
  const [store] = useState(() => createShellStore(initial));
  const locale = useStore(store, (state) => state.locale);
  const theme = useStore(store, (state) => state.theme);
  const sidebarOpen = useStore(store, (state) => state.sidebarOpen);
  const collapsedGroups = useStore(store, (state) => state.collapsedGroups);

  useEffect(() => {
    const root = document.documentElement;
    root.lang = locale === 'zh' ? 'zh-CN' : 'en';
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    savePreference(preferenceConfig.cookies.locale, locale);
    savePreference(preferenceConfig.cookies.theme, theme);
    savePreference(preferenceConfig.cookies.sidebar, String(sidebarOpen));
    savePreference(preferenceConfig.cookies.groups, JSON.stringify(collapsedGroups));
  }, [locale, theme, sidebarOpen, collapsedGroups]);

  return (
    <ShellContext.Provider value={store}>
      <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="UTC">
        {children}
      </NextIntlClientProvider>
    </ShellContext.Provider>
  );
}

function savePreference(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${preferenceConfig.maxAge}; SameSite=Lax${secure}`;
}

export function useShell<T>(selector: (state: ShellState) => T): T {
  const store = useContext(ShellContext);
  if (!store) throw new Error('ShellProvider is required');
  return useStore(store, selector);
}
