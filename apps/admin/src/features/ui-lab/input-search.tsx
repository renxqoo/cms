'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { NativeSelect, SearchBar } from '@new-cms/ui/forms';
import { LabOutput, LabSection } from './lab-section';

export function SearchInputsExample() {
  const t = useTranslations('inputs');
  const [value, setValue] = useState('');
  const [committed, setCommitted] = useState('');
  const [mode, setMode] = useState<'submit' | 'debounced'>('submit');
  return (
    <LabSection title={t('search')}>
      <NativeSelect
        aria-label={t('searchMode')}
        value={mode}
        onChange={(event) =>
          setMode(event.currentTarget.value === 'debounced' ? 'debounced' : 'submit')
        }
      >
        <option value="submit">{t('submitMode')}</option>
        <option value="debounced">{t('debouncedMode')}</option>
      </NativeSelect>
      <SearchBar
        value={value}
        onValueChange={setValue}
        onSearch={setCommitted}
        mode={mode === 'submit' ? { type: 'submit' } : { type: 'debounced', delayMs: 350 }}
        label={t('searchLabel')}
        searchLabel={t('searchAction')}
        clearLabel={t('clearSearch')}
        placeholder={t('searchPlaceholder')}
      />
      <LabOutput label={t('committed')} value={committed} />
    </LabSection>
  );
}
