import { expect, it } from 'vitest';
import { parsePreferences } from '../../../config/preferences';
import { createShellStore } from '../shell-store';

it('invalid preference values use a deterministic server-rendered language and theme', () => {
  expect(parsePreferences({ locale: 'fr', theme: 'system', groups: '{' })).toEqual({
    locale: 'zh',
    theme: 'light',
    sidebarOpen: true,
    collapsedGroups: [],
  });
});

it('restores stable navigation group IDs and deduplicates stored preferences', () => {
  expect(
    parsePreferences({
      locale: 'en',
      theme: 'dark',
      sidebar: 'false',
      groups: '["components",42,"components","patterns"]',
    }),
  ).toEqual({
    locale: 'en',
    theme: 'dark',
    sidebarOpen: false,
    collapsedGroups: ['components', 'patterns'],
  });
  expect(parsePreferences({ groups: '{}' }).collapsedGroups).toEqual([]);
});

it('separate shell instances never share preference or drawer state', () => {
  const first = createShellStore(parsePreferences({}));
  const second = createShellStore(parsePreferences({}));
  first.getState().setLocale('en');
  first.getState().setTheme('dark');
  first.getState().toggleSidebar();
  first.getState().setMobileOpen(true);
  first.getState().toggleGroup('components');
  expect(second.getState()).toMatchObject({
    locale: 'zh',
    theme: 'light',
    sidebarOpen: true,
    mobileOpen: false,
    collapsedGroups: [],
  });
  first.getState().toggleGroup('components');
  expect(first.getState().collapsedGroups).toEqual([]);
});
