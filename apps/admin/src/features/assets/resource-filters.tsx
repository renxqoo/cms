'use client';

import { NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import type { Collection } from '../../contracts/content';
import type { ResourceQuery } from './resource-query';
import { assetMessages } from './messages';

export function ResourceFilters({
  query,
  collections,
  onChange,
}: {
  query: ResourceQuery;
  collections: readonly Collection[];
  onChange: (changes: Partial<ResourceQuery>) => void;
}) {
  const t = assetMessages[useShell((state) => state.locale)];
  const selected = collections.find((collection) => collection.key === query.collection);
  return (
    <>
      <NativeSelect
        aria-label={t.collection}
        value={query.collection}
        onChange={(event) => onChange({ collection: event.currentTarget.value, locale: '' })}
      >
        <option value="">{t.allCollections}</option>
        {collections.map((collection) => (
          <option key={collection.key} value={collection.key}>
            {collection.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={t.status}
        value={query.trashed}
        onChange={(event) =>
          onChange({ trashed: event.currentTarget.value === 'true' ? 'true' : 'false' })
        }
      >
        <option value="false">{t.active}</option>
        <option value="true">{t.trash}</option>
      </NativeSelect>
      {selected ? (
        <NativeSelect
          aria-label={t.defaultLocale}
          value={selected.locales.includes(query.locale) ? query.locale : ''}
          onChange={(event) => onChange({ locale: event.currentTarget.value })}
        >
          <option value="">{t.defaultLocale}</option>
          {selected.locales.map((locale) => (
            <option key={locale} value={locale}>
              {locale}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </>
  );
}
