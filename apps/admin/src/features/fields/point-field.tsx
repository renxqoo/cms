'use client';

import { Input } from '@new-cms/ui/forms';
import { useFieldValue } from './field-context';
import { useFieldDraft } from './use-field-draft';
import type { ScalarProps } from './scalar-fields';

function parsePoint(text: string) {
  const values = text.split(',');
  if (values.every((value) => !value.trim())) return { valid: true, value: null };
  const numbers = values.map(Number);
  const [longitude, latitude] = numbers;
  const valid =
    values.length === 2 &&
    values.every((value) => /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(value.trim())) &&
    longitude !== undefined &&
    latitude !== undefined &&
    numbers.every(Number.isFinite) &&
    Math.abs(longitude) <= 180 &&
    Math.abs(latitude) <= 90;
  return { valid, value: valid ? numbers : null };
}

export function PointField({ node, location, readOnly }: ScalarProps) {
  const field = useFieldValue(location);
  const initial = Array.isArray(field.value)
    ? field.value.map((value) => (typeof value === 'number' ? String(value) : '')).join(',')
    : ',';
  const draft = useFieldDraft({
    initial,
    identity: location.identity,
    invalidMessage: field.t.invalid,
    parse: parsePoint,
    onChange: field.change,
    onValidityChange: field.onValidityChange,
  });
  const [longitude = '', latitude = ''] = draft.text.split(',');
  function change(index: number, value: string) {
    const parts: string[] = [longitude, latitude];
    parts[index] = value;
    draft.change(parts.join(','));
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Input
          aria-label={`${node.label} ${field.t.longitude}`}
          inputMode="decimal"
          placeholder={node.placeholder}
          value={longitude}
          readOnly={readOnly}
          onChange={(event) => change(0, event.currentTarget.value)}
        />
        <Input
          id={`${field.idPrefix}-${location.path.map(String).join('-')}-latitude`}
          aria-label={`${node.label} ${field.t.latitude}`}
          inputMode="decimal"
          placeholder={node.placeholder}
          value={latitude}
          readOnly={readOnly}
          onChange={(event) => change(1, event.currentTarget.value)}
        />
      </div>
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </>
  );
}
