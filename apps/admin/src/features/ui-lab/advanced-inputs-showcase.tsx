'use client';

import { useState } from 'react';
import { enUS, zhCN } from 'date-fns/locale';
import { Button } from '@new-cms/ui/actions';
import { CodeEditor, DatePicker } from '@new-cms/ui/forms';
import type { DatePickerAppearance, DatePickerProps } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { advancedInputsMessages } from './advanced-inputs-messages';
import { LabOutput, LabSection } from './lab-section';

const advancedExampleConfig = {
  appearances: ['default', 'dayAndTime', 'dayOnly', 'monthOnly', 'timeOnly'],
  reference: '2026-10-26T08:30:00Z',
  earliest: '2026-10-25T00:00:00Z',
  latest: '2026-10-28T00:00:00Z',
  timeIntervals: 15,
  editorAssets: '/generated/editor/vs',
  minHeight: 160,
  maxHeight: 320,
} as const;

function formatDate(date: Date, appearance: DatePickerAppearance): string {
  const value = date.toISOString();
  if (appearance === 'timeOnly') return value.slice(11, 16);
  if (appearance === 'monthOnly') return value.slice(0, 7);
  if (appearance === 'dayOnly') return value.slice(5, 10);
  if (appearance === 'dayAndTime') return value.slice(0, 16).replace('T', ' ');
  return value.slice(0, 10);
}

function initialDates(): Record<DatePickerAppearance, Date | null> {
  return {
    default: new Date(advancedExampleConfig.reference),
    dayAndTime: new Date(advancedExampleConfig.reference),
    dayOnly: new Date(advancedExampleConfig.reference),
    monthOnly: new Date(advancedExampleConfig.reference),
    timeOnly: new Date(advancedExampleConfig.reference),
  };
}

function DateExamples() {
  const locale = useShell((state) => state.locale);
  const text = advancedInputsMessages[locale];
  const [values, setValues] = useState(initialDates);
  const [bounded, setBounded] = useState<Date | null>(
    () => new Date(advancedExampleConfig.reference),
  );
  const common: Pick<
    DatePickerProps,
    'referenceDate' | 'placeholder' | 'locale' | 'format' | 'timeIntervals'
  > = {
    referenceDate: new Date(advancedExampleConfig.reference),
    placeholder: text.placeholder,
    locale: locale === 'zh' ? zhCN : enUS,
    format: formatDate,
    timeIntervals: advancedExampleConfig.timeIntervals,
  };
  function labels(label: string) {
    return {
      clear: text.clear(label),
      time: text.time,
      previousMonth: text.previous,
      nextMonth: text.next,
      invalid: text.invalid,
      day: (date: Date) => date.toISOString().slice(0, 10),
    };
  }
  return (
    <LabSection title={text.dates} description={text.datesDescription}>
      <div className="grid gap-4 md:grid-cols-2">
        {advancedExampleConfig.appearances.map((appearance) => (
          <DatePicker
            key={appearance}
            {...common}
            appearance={appearance}
            label={text.modes[appearance]}
            labels={labels(text.modes[appearance])}
            value={values[appearance]}
            onChange={(next) => setValues((current) => ({ ...current, [appearance]: next }))}
          />
        ))}
        <DatePicker
          {...common}
          label={text.bounded}
          labels={labels(text.bounded)}
          value={bounded}
          onChange={setBounded}
          minDate={new Date(advancedExampleConfig.earliest)}
          maxDate={new Date(advancedExampleConfig.latest)}
        />
        <DatePicker
          {...common}
          label={text.readonlyDate}
          labels={labels(text.readonlyDate)}
          value={bounded}
          onChange={setBounded}
          readOnly
        />
      </div>
      <LabOutput
        label={text.dateValue}
        value={Object.fromEntries(
          Object.entries(values).map(([key, value]) => [key, value?.toISOString() ?? null]),
        )}
      />
    </LabSection>
  );
}

function reloadEditorPage() {
  window.location.reload();
}

function CodeExamples() {
  const locale = useShell((state) => state.locale);
  const theme = useShell((state) => state.theme);
  const text = advancedInputsMessages[locale];
  const [code, setCode] = useState('{\n  "name": "OneAster",\n  "draft": true\n}');
  const [preview, setPreview] = useState('export const cms = "OneAster";');
  const [readOnly, setReadOnly] = useState(false);
  const common = {
    theme,
    assetBaseUrl: advancedExampleConfig.editorAssets,
    minHeight: advancedExampleConfig.minHeight,
    maxHeight: advancedExampleConfig.maxHeight,
    loadingLabel: text.loading,
    errorLabel: text.error,
    retryLabel: text.retry,
    onRetry: reloadEditorPage,
  };
  return (
    <LabSection
      title={text.editor}
      description={text.editorDescription}
      actions={
        <Button
          variant="outline"
          aria-pressed={readOnly}
          onClick={() => setReadOnly((current) => !current)}
        >
          {readOnly ? text.editable : text.readonly}
        </Button>
      }
    >
      <CodeEditor
        {...common}
        label={text.code}
        language="json"
        value={code}
        onChange={setCode}
        readOnly={readOnly}
      />
      <CodeEditor
        {...common}
        label={text.preview}
        language="typescript"
        value={preview}
        onChange={setPreview}
        readOnly
      />
      <LabOutput label={text.codeValue} value={code} />
    </LabSection>
  );
}

export function AdvancedInputsShowcase() {
  return (
    <>
      <DateExamples />
      <CodeExamples />
    </>
  );
}
