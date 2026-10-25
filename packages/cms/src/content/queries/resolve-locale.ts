import type { CollectionDefinition } from '../definition.ts';
export interface ReadLocaleContext {
  locale: string;
  fallback: readonly string[];
}
export function targetReadContext(input: {
  collection: CollectionDefinition;
  locale: string;
  fallback?: readonly string[];
}): ReadLocaleContext {
  const { locales } = input.collection;
  const locale = locales.supported.includes(input.locale) ? input.locale : locales.default;
  const fallback =
    input.fallback ??
    (Object.hasOwn(locales.fallback, locale) ? (locales.fallback[locale] ?? []) : []);
  return {
    locale,
    fallback: [
      ...new Set(
        fallback.filter(
          (candidate) => candidate !== locale && locales.supported.includes(candidate),
        ),
      ),
    ],
  };
}
