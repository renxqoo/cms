'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '@new-cms/ui/actions';
import { SortableList } from '@new-cms/ui/data';
import { Input } from '@new-cms/ui/forms';
import { useFieldValue } from './field-context';
import { parseNumber, parseText } from './parsing';
import { useFieldDraft } from './use-field-draft';
import { fieldSorting } from './sorting';
import type { ScalarProps } from './scalar-fields';
import type { JsonValue } from './types';

interface PrimitiveRow {
  id: string;
  value: JsonValue;
}

function parseItem(text: string, node: ScalarProps['node']) {
  if (node.type === 'number') {
    const parsed = parseNumber(text, node);
    return { ...parsed, valid: parsed.valid && typeof parsed.value === 'number' };
  }
  const parsed = parseText(text, node);
  return {
    valid: text === '' ? (node.constraints.minLength ?? 0) === 0 : parsed.valid,
    value: text,
  };
}

function PrimitiveInput({
  row,
  node,
  label,
  readOnly,
  onChange,
  onValidityChange,
  invalidMessage,
}: {
  row: PrimitiveRow;
  node: ScalarProps['node'];
  label: string;
  readOnly: boolean;
  onChange: (value: JsonValue) => void;
  onValidityChange: (identity: string, error: string | null) => void;
  invalidMessage: string;
}) {
  const draft = useFieldDraft({
    initial:
      typeof row.value === 'string' || typeof row.value === 'number'
        ? String(row.value)
        : JSON.stringify(row.value),
    identity: row.id,
    parse: (text) => parseItem(text, node),
    onChange,
    onValidityChange,
    invalidMessage,
  });
  return (
    <div className="min-w-0 flex-1">
      <Input
        value={draft.text}
        placeholder={node.placeholder}
        aria-label={label}
        inputMode={node.type === 'number' ? 'decimal' : 'text'}
        readOnly={readOnly}
        aria-invalid={draft.error !== null}
        onChange={(event) => draft.change(event.currentTarget.value)}
      />
      {draft.error ? (
        <p role="alert" className="text-sm text-destructive">
          {draft.error}
        </p>
      ) : null}
    </div>
  );
}

function useRowValidity(props: ScalarProps, size: number) {
  const field = useFieldValue(props.location);
  const minimum = props.node.constraints.minRows ?? 0;
  const maximum = props.node.constraints.maxRows ?? Infinity;
  const error = size < minimum || size > maximum ? field.t.invalid : null;
  const report = useEffectEvent(field.onValidityChange);
  const identity = `${props.location.identity}:row-count`;
  useEffect(() => {
    report(identity, error);
    return () => report(identity, null);
  }, [identity, error]);
  return { minimum, maximum, error };
}

export function PrimitiveArrayField(props: ScalarProps) {
  const { node, location, readOnly } = props;
  const field = useFieldValue(location);
  const values = Array.isArray(field.value) ? field.value : [];
  const [ids, setIds] = useState(() => values.map(() => crypto.randomUUID()));
  const rows = values.map((value, index) => ({
    id: ids[index] ?? `${location.identity}:${index}`,
    value,
  }));
  const validity = useRowValidity(props, rows.length);
  function change(next: readonly PrimitiveRow[]) {
    if (readOnly) return;
    setIds(next.map((row) => row.id));
    field.change(next.map((row) => row.value));
  }
  function label(row: PrimitiveRow) {
    return `${node.label} ${rows.indexOf(row) + 1}`;
  }
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-border/60 p-4">
      <legend className="px-1 text-sm font-medium">
        {node.label}
        {node.required ? ' *' : ''}
      </legend>
      <SortableList
        items={rows}
        getId={(row) => row.id}
        getItemLabel={label}
        onChange={change}
        labels={fieldSorting(field.t, node.label)}
        disabled={readOnly}
        renderItem={(row, handle) => (
          <div className="flex min-w-0 items-start gap-2">
            {handle}
            <PrimitiveInput
              row={row}
              node={node}
              label={label(row)}
              readOnly={readOnly}
              onChange={(value) =>
                change(
                  rows.map((candidate) =>
                    candidate.id === row.id ? { ...candidate, value } : candidate,
                  ),
                )
              }
              onValidityChange={field.onValidityChange}
              invalidMessage={field.t.invalid}
            />
            {!readOnly ? (
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={rows.length <= validity.minimum}
                aria-label={`${field.t.remove} ${label(row)}`}
                onClick={() => change(rows.filter((candidate) => candidate.id !== row.id))}
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </div>
        )}
      />
      {!readOnly ? (
        <Button
          variant="outline"
          disabled={rows.length >= validity.maximum}
          onClick={() =>
            change([
              ...rows,
              {
                id: crypto.randomUUID(),
                value: node.type === 'number' ? (node.constraints.min ?? 0) : '',
              },
            ])
          }
        >
          <PlusIcon />
          {field.t.add}
        </Button>
      ) : null}
      {(validity.error ?? field.error) ? (
        <p role="alert" className="text-sm text-destructive">
          {validity.error ?? field.error}
        </p>
      ) : null}
    </fieldset>
  );
}
