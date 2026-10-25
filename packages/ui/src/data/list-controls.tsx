'use client';

import { NativeSelect } from '../forms/field.tsx';
import { Checkbox } from '../forms/choices.tsx';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover.tsx';
import { Button } from '../primitives/button.tsx';
import type { DataTableSort } from './data-table.tsx';

export interface SortSelectProps {
  columns: readonly { key: string; label: string }[];
  value: DataTableSort | null;
  onChange: (value: DataTableSort | null) => void;
  labels: { label: string; noneLabel: string; ascendingLabel: string; descendingLabel: string };
}

export function SortSelect({ columns, value, onChange, labels }: SortSelectProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <NativeSelect
        aria-label={labels.label}
        value={value?.key ?? ''}
        onChange={(event) => {
          const key = event.currentTarget.value;
          if (key === '') onChange(null);
          else if (columns.some((column) => column.key === key))
            onChange({ key, direction: value?.direction ?? 'asc' });
        }}
      >
        <option value="">{labels.noneLabel}</option>
        {columns.map((column) => (
          <option key={column.key} value={column.key}>
            {column.label}
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label={`${labels.ascendingLabel} / ${labels.descendingLabel}`}
        value={value?.direction ?? 'asc'}
        disabled={value === null}
        onChange={(event) => {
          const direction = event.currentTarget.value;
          if (value && (direction === 'asc' || direction === 'desc'))
            onChange({ ...value, direction });
        }}
      >
        <option value="asc">{labels.ascendingLabel}</option>
        <option value="desc">{labels.descendingLabel}</option>
      </NativeSelect>
    </div>
  );
}

export interface ColumnSelectorProps {
  columns: readonly { key: string; label: string; locked?: boolean }[];
  selectedKeys: readonly string[];
  onChange: (keys: string[]) => void;
  label: string;
}

export function ColumnSelector({ columns, selectedKeys, onChange, label }: ColumnSelectorProps) {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="outline">{label}</Button>} />
      <PopoverContent className="grid gap-2">
        {columns.map((column) => (
          <Checkbox
            key={column.key}
            label={column.label}
            checked={selectedKeys.includes(column.key)}
            disabled={column.locked}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...new Set([...selectedKeys, column.key])]
                  : selectedKeys.filter((key) => key !== column.key),
              )
            }
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
