'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SearchBar } from '@new-cms/ui/forms';

export function ListSearch({
  query,
  onSearch,
}: {
  query: string;
  onSearch: (value: string) => void;
}) {
  const [value, setValue] = useState(query);
  const t = useTranslations('lists');
  return (
    <SearchBar
      value={value}
      onValueChange={setValue}
      onSearch={onSearch}
      mode={{ type: 'submit' }}
      label={t('searchLabel')}
      searchLabel={t('search')}
      clearLabel={t('clearSearch')}
      placeholder={t('searchPlaceholder')}
    />
  );
}
