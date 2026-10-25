import { createStore } from 'zustand/vanilla';
import type { Locale, ShellPreferences, Theme } from '../../config/preferences';

export interface ShellState extends ShellPreferences {
  mobileOpen: boolean;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setMobileOpen: (open: boolean) => void;
  toggleGroup: (id: string) => void;
}

export function createShellStore(initial: ShellPreferences) {
  return createStore<ShellState>()((set) => ({
    ...initial,
    mobileOpen: false,
    setLocale: (locale) => set({ locale }),
    setTheme: (theme) => set({ theme }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setMobileOpen: (mobileOpen) => set({ mobileOpen }),
    toggleGroup: (id) =>
      set((state) => ({
        collapsedGroups: state.collapsedGroups.includes(id)
          ? state.collapsedGroups.filter((group) => group !== id)
          : [...state.collapsedGroups, id],
      })),
  }));
}
