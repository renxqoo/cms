'use client';

import { zonedDateInput, parseZonedDate } from './timezone';
import { useShell } from '../../components/shell/shell-provider';
import { labelledOptions } from './option-labels';
import { Input, NativeSelect, RadioGroup, Textarea } from '@new-cms/ui/forms';
import type { EditorNode } from '../../contracts/editor';
import { useFieldValue } from './field-context';
import { dateInput, parseDate, parseNumber, parseText } from './parsing';
import { useFieldDraft } from './use-field-draft';
import type { FieldLocation } from './types';

export interface ScalarProps {
  node: EditorNode;
  location: FieldLocation;
  readOnly: boolean;
}

export function TextField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const draft = useFieldDraft({
    initial: typeof field.value === 'string' ? field.value : '',
    identity: location.identity,
    invalidMessage: field.t.invalid,
    parse: (text) => parseText(text, node),
    onChange: field.change,
    onValidityChange: field.onValidityChange,
  });
  const props = {
    value: draft.text,
    placeholder: node.placeholder,
    readOnly,
    'aria-invalid': Boolean(draft.error ?? field.error),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      draft.change(event.currentTarget.value),
  };
  return (
    <>
      {node.type === 'textarea' ? (
        <Textarea {...props} />
      ) : (
        <Input {...props} type={node.type === 'email' ? 'email' : 'text'} />
      )}
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </>
  );
}

export function NumberField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const draft = useFieldDraft({
    initial: typeof field.value === 'number' ? String(field.value) : '',
    identity: location.identity,
    invalidMessage: field.t.invalid,
    parse: (text) => parseNumber(text, node),
    onChange: field.change,
    onValidityChange: field.onValidityChange,
  });
  return (
    <>
      <Input
        value={draft.text}
        placeholder={node.placeholder}
        inputMode="decimal"
        readOnly={readOnly}
        aria-invalid={Boolean(draft.error ?? field.error)}
        onChange={(event) => draft.change(event.currentTarget.value)}
      />
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </>
  );
}

export function BooleanField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const value = typeof field.value === 'boolean' ? String(field.value) : null;
  return (
    <RadioGroup
      label={node.label}
      value={value}
      readOnly={readOnly}
      options={[
        { value: 'true', label: field.t.yes },
        { value: 'false', label: field.t.no },
      ]}
      onValueChange={(next) => field.change(next === 'true')}
    />
  );
}

export function DateField(props: ScalarProps) {
  const { node, location } = props;
  const zone = useFieldValue({
    ...location,
    path: [...location.path.slice(0, -1), node.constraints.timezone ?? ''],
  });
  const timezone = node.constraints.timezone && typeof zone.value === 'string' ? zone.value : 'UTC';
  return <DateInput key={timezone} {...props} timezone={timezone} />;
}

function DateInput({ node, location, readOnly, timezone }: ScalarProps & { timezone: string }) {
  const field = useFieldValue(location);
  const draft = useFieldDraft({
    initial: node.constraints.timezone
      ? zonedDateInput(field.value, timezone)
      : dateInput(field.value),
    identity: `${location.identity}/${timezone}`,
    invalidMessage: field.t.invalid,
    parse: node.constraints.timezone ? (text) => parseZonedDate(text, timezone) : parseDate,
    onChange: field.change,
    onValidityChange: field.onValidityChange,
  });
  return (
    <>
      <Input
        placeholder={node.placeholder}
        type="datetime-local"
        step="0.001"
        value={draft.text}
        readOnly={readOnly}
        aria-invalid={Boolean(draft.error ?? field.error)}
        onChange={(event) => draft.change(event.currentTarget.value)}
      />
      <span className="text-xs text-muted-foreground">
        {node.constraints.timezone ? timezone : field.t.utc}
      </span>
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </>
  );
}

export function SingleSelectField({ node, location, readOnly }: ScalarProps) {
  const locale = useShell((shell) => shell.locale);
  const field = useFieldValue(location);
  return (
    <NativeSelect
      className="w-full"
      disabled={readOnly}
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={(event) => field.change(event.currentTarget.value || null)}
    >
      <option value="">{node.placeholder ?? field.t.unset}</option>
      {labelledOptions(node.constraints.options ?? [], locale).map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </NativeSelect>
  );
}

export function RadioField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const locale = useShell((shell) => shell.locale);
  return (
    <RadioGroup
      label={node.label}
      value={typeof field.value === 'string' ? field.value : null}
      readOnly={readOnly}
      options={labelledOptions(node.constraints.options ?? [], locale)}
      onValueChange={field.change}
    />
  );
}
