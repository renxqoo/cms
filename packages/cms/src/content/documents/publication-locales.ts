import { fail } from '@new-cms/cms/platform/contracts';
import type { CollectionDefinition, DocumentData } from '../definition.ts';

export function publicationLocales(
  collection: CollectionDefinition,
  data: DocumentData,
  locale: string,
): readonly string[] {
  if (!collection.publicationLocalesField)
    return collection.localizeStatus ? [locale] : collection.locales.supported;
  const selected = data[collection.publicationLocalesField];
  if (
    !Array.isArray(selected) ||
    selected.length === 0 ||
    selected.length > collection.locales.supported.length
  )
    fail('invalid_input');
  const result: string[] = [];
  for (const value of selected) {
    if (
      typeof value !== 'string' ||
      !collection.locales.supported.includes(value) ||
      result.includes(value)
    )
      fail('invalid_input');
    result.push(value);
  }
  return result;
}
