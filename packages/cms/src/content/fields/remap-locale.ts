import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition } from '../definition.ts';
export function historicalLocale(input: {
  current: CollectionDefinition;
  schemaVersion: number;
  locale: string;
}): string | null {
  if (input.schemaVersion > input.current.schemaVersion) fail('invalid_input');
  let locale: string | null = input.locale;
  for (
    let version = input.current.schemaVersion - 1;
    version >= input.schemaVersion;
    version -= 1
  ) {
    const migration = input.current.migrations?.find((item) => item.from === version);
    if (locale !== null && migration?.localeMap && Object.hasOwn(migration.localeMap, locale))
      locale = migration.localeMap[locale] ?? null;
  }
  return locale;
}
export function historicalReadContext(input: {
  current: CollectionDefinition;
  schemaVersion: number;
  locale: string;
  fallback?: readonly string[] | undefined;
}): { locale: string; fallback: string[] } {
  const locales = [input.locale, ...(input.fallback ?? [])]
    .map((locale) => historicalLocale({ ...input, locale }))
    .filter((locale): locale is string => locale !== null);
  return { locale: locales[0] ?? '__absent_locale__', fallback: [...new Set(locales.slice(1))] };
}
