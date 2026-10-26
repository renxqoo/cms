'use client';

import { Button } from '@new-cms/ui/actions';
import { Field, Input, NativeSelect } from '@new-cms/ui/forms';
import { useShell } from '../../components/shell/shell-provider';
import { assetMessages } from './messages';
import type { VariantDraft } from './image-recipe';

export function VariantFields({
  rows,
  maximum,
  readOnly,
  onChange,
}: {
  rows: readonly VariantDraft[];
  maximum: number;
  readOnly: boolean;
  onChange: (value: VariantDraft[]) => void;
}) {
  const t = assetMessages[useShell((state) => state.locale)];
  function change(id: string, name: keyof VariantDraft, value: string) {
    onChange(rows.map((row) => (row.id === id ? { ...row, [name]: value } : row)));
  }
  return (
    <fieldset className="space-y-4">
      <legend className="mb-2 text-sm font-medium">{t.variants}</legend>
      {rows.map((row) => (
        <div key={row.id} className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ['name', t.variantName],
                ['width', t.width],
                ['height', t.height],
                ['quality', t.quality],
              ] as const
            ).map(([name, label]) => (
              <Field key={name} id={`${row.id}-${name}`} label={label}>
                <Input
                  value={row[name]}
                  inputMode={name === 'name' ? 'text' : 'numeric'}
                  readOnly={readOnly}
                  onChange={(event) => change(row.id, name, event.currentTarget.value)}
                />
              </Field>
            ))}
            <Field id={`${row.id}-fit`} label={t.fit}>
              <NativeSelect
                value={row.fit}
                disabled={readOnly}
                onChange={(event) => change(row.id, 'fit', event.currentTarget.value)}
              >
                <option value="">{t.choose}</option>
                {['cover', 'contain', 'inside'].map((fit) => (
                  <option key={fit} value={fit}>
                    {fit}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field id={`${row.id}-format`} label={t.format}>
              <NativeSelect
                value={row.format}
                disabled={readOnly}
                onChange={(event) => change(row.id, 'format', event.currentTarget.value)}
              >
                <option value="">{t.choose}</option>
                {['jpeg', 'png', 'webp'].map((format) => (
                  <option key={format} value={format}>
                    {format}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          {!readOnly ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(rows.filter((entry) => entry.id !== row.id))}
            >
              {t.remove}
            </Button>
          ) : null}
        </div>
      ))}
      {!readOnly ? (
        <Button
          variant="outline"
          size="sm"
          disabled={rows.length >= maximum}
          onClick={() =>
            onChange([
              ...rows,
              {
                id: crypto.randomUUID(),
                name: '',
                width: '',
                height: '',
                fit: '',
                format: '',
                quality: '',
              },
            ])
          }
        >
          {t.addVariant}
        </Button>
      ) : null}
    </fieldset>
  );
}
