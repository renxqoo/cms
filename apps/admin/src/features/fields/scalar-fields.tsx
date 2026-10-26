'use client';

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

export function DateField({ location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const draft = useFieldDraft({
    initial: dateInput(field.value),
    identity: location.identity,
    invalidMessage: field.t.invalid,
    parse: parseDate,
    onChange: field.change,
    onValidityChange: field.onValidityChange,
  });
  return (
    <>
      <Input
        type="datetime-local"
        step="0.001"
        value={draft.text}
        readOnly={readOnly}
        aria-invalid={Boolean(draft.error ?? field.error)}
        onChange={(event) => draft.change(event.currentTarget.value)}
      />
      <span className="text-xs text-muted-foreground">{field.t.utc}</span>
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </>
  );
}

export function SingleSelectField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  return (
    <NativeSelect
      className="w-full"
      disabled={readOnly}
      value={typeof field.value === 'string' ? field.value : ''}
      onChange={(event) => field.change(event.currentTarget.value || null)}
    >
      <option value="">{field.t.unset}</option>
      {(node.constraints.options ?? []).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </NativeSelect>
  );
}
