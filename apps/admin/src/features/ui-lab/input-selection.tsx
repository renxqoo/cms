'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox, PillSelector, Select, TimezonePicker } from '@new-cms/ui/forms';
import type { SelectOption, SelectOptionsResult, SelectCreateResult } from '@new-cms/ui/forms';
import { LabOutput, LabSection } from './lab-section';
import { useSortingLabels } from './sorting-labels';
import { delayExample } from './delay-example';

function options(copy: (key: string) => string): readonly SelectOption[] {
  return [
    { value: 'editorial', label: copy('editorial'), group: copy('teams') },
    { value: 'design', label: copy('design'), group: copy('teams') },
    { value: 'engineering', label: copy('engineering'), group: copy('teams') },
    { value: 'archived', label: copy('archived'), group: copy('disabledGroup'), disabled: true },
  ];
}

export function PillSelectionExample() {
  const t = useTranslations('inputs');
  const [value, setValue] = useState<readonly string[]>(['editorial']);
  const [multiple, setMultiple] = useState(true);
  const sorting = useSortingLabels(t('pills'));
  return (
    <LabSection title={t('pills')}>
      <Checkbox
        label={t('multiple')}
        checked={multiple}
        onCheckedChange={(checked) => {
          setMultiple(checked);
          if (!checked) setValue((current) => current.slice(0, 1));
        }}
      />
      <PillSelector
        options={options(t)}
        value={value}
        onChange={setValue}
        multiple={multiple}
        sorting={sorting}
        removeLabel={(label) => t('remove', { label })}
      />
      <LabOutput label={t('values')} value={value} />
    </LabSection>
  );
}

export function SelectInputsExample() {
  const t = useTranslations('inputs');
  const [single, setSingle] = useState<string | null>('design');
  const [multiple, setMultiple] = useState<readonly string[]>(['editorial']);
  const sorting = useSortingLabels(t('multi'));
  const labels = {
    placeholder: t('optionsPlaceholder'),
    emptyLabel: t('noOptions'),
    loadingLabel: t('loading'),
    errorLabel: t('selectionError'),
    clearLabel: t('clear'),
    removeLabel: (label: string) => t('remove', { label }),
  };
  return (
    <LabSection title={t('selections')}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Select
          label={t('single')}
          options={options(t)}
          value={single}
          onChange={setSingle}
          {...labels}
        />
        <Select
          multiple
          label={t('multi')}
          options={options(t)}
          value={multiple}
          onChange={setMultiple}
          sorting={sorting}
          {...labels}
        />
      </div>
      <LabOutput label={t('values')} value={{ single, multiple }} />
    </LabSection>
  );
}

export function AsyncSelectionExample() {
  const t = useTranslations('inputs');
  const [value, setValue] = useState<string | null>(null);
  const [failure, setFailure] = useState(false);
  function load({
    query,
    signal,
  }: {
    query: string;
    signal: AbortSignal;
  }): Promise<SelectOptionsResult> {
    const result: SelectOptionsResult = failure
      ? { status: 'error', message: t('selectionError') }
      : {
          status: 'success',
          options: options(t).filter((option) =>
            option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
          ),
        };
    return delayExample(result, signal, 350);
  }
  function create({
    query,
    signal,
  }: {
    query: string;
    signal: AbortSignal;
  }): Promise<SelectCreateResult> {
    const result: SelectCreateResult = failure
      ? { status: 'error', message: t('selectionError') }
      : { status: 'success', option: { value: `local-${crypto.randomUUID()}`, label: query } };
    return delayExample(result, signal, 350);
  }
  return (
    <LabSection title={t('async')} description={t('asyncDescription')}>
      <Checkbox label={t('failure')} checked={failure} onCheckedChange={setFailure} />
      <Select
        label={t('asyncLabel')}
        options={options(t)}
        value={value}
        onChange={setValue}
        loadOptions={load}
        onCreate={create}
        createLabel={(query) => t('create', { query })}
        placeholder={t('optionsPlaceholder')}
        emptyLabel={t('noOptions')}
        loadingLabel={t('loading')}
        errorLabel={t('selectionError')}
        clearLabel={t('clear')}
        removeLabel={(label) => t('remove', { label })}
      />
      <LabOutput label={t('values')} value={value} />
    </LabSection>
  );
}

export function TimezoneExample() {
  const t = useTranslations('inputs');
  const [value, setValue] = useState<string | null>('Asia/Singapore');
  return (
    <LabSection title={t('timezone')} description={t('timezoneDescription')}>
      <TimezonePicker
        label={t('timezone')}
        timezones={[
          { value: 'UTC', label: 'UTC' },
          { value: 'Asia/Singapore', label: t('singapore') },
          { value: 'America/New_York', label: t('newYork') },
          { value: 'Europe/Paris', label: t('paris') },
        ]}
        value={value}
        onChange={setValue}
        placeholder={t('optionsPlaceholder')}
        emptyLabel={t('noOptions')}
        loadingLabel={t('loading')}
        errorLabel={t('selectionError')}
        clearLabel={t('clear')}
        removeLabel={(label) => t('remove', { label })}
      />
      <LabOutput label={t('values')} value={value} />
    </LabSection>
  );
}
