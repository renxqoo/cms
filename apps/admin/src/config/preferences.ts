export const preferenceConfig = {
  cookies: {
    locale: 'oneaster-locale',
    theme: 'oneaster-theme',
    sidebar: 'oneaster-sidebar',
    groups: 'oneaster-navigation-groups',
  },
  maxAge: 31536000,
  defaults: { locale: 'zh', theme: 'light', sidebarOpen: true },
} as const;

export type Locale = 'zh' | 'en';
export type Theme = 'light' | 'dark';

export interface ShellPreferences {
  locale: Locale;
  theme: Theme;
  sidebarOpen: boolean;
  collapsedGroups: readonly string[];
}

export function parsePreferences(values: {
  locale?: string | undefined;
  theme?: string | undefined;
  sidebar?: string | undefined;
  groups?: string | undefined;
}): ShellPreferences {
  return {
    locale: values.locale === 'en' ? 'en' : preferenceConfig.defaults.locale,
    theme: values.theme === 'dark' ? 'dark' : preferenceConfig.defaults.theme,
    sidebarOpen: values.sidebar !== 'false',
    collapsedGroups: parseGroups(values.groups),
  };
}

function parseGroups(value: string | undefined): readonly string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string'))];
  } catch {
    return [];
  }
}
