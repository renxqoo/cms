'use client';

import { Button } from '../primitives/button.tsx';
import { Pill } from '../feedback/pill.tsx';
import { SortableList } from '../data/sortable-list.tsx';
import type { SortableLabels } from '../data/sortable-list.tsx';

export interface PillOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface PillSelectorProps {
  options: readonly PillOption[];
  value: readonly string[];
  onChange: (value: string[]) => void;
  multiple?: boolean;
  sorting: SortableLabels;
  removeLabel: (label: string) => string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function PillSelector({
  options,
  value,
  onChange,
  multiple = true,
  sorting,
  removeLabel,
  disabled = false,
  readOnly = false,
}: PillSelectorProps) {
  const selected = value.map(
    (key) => options.find((option) => option.value === key) ?? { value: key, label: key },
  );
  function toggle(option: PillOption) {
    if (disabled || readOnly || option.disabled) return;
    onChange(
      value.includes(option.value)
        ? value.filter((key) => key !== option.value)
        : multiple
          ? [...value, option.value]
          : [option.value],
    );
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.value}
            variant={value.includes(option.value) ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={value.includes(option.value)}
            disabled={disabled || readOnly || option.disabled === true}
            onClick={() => toggle(option)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <SortableList
        items={selected}
        getId={(option) => option.value}
        getItemLabel={(option) => option.label}
        labels={sorting}
        orientation="horizontal"
        disabled={disabled || readOnly || !multiple}
        isItemDisabled={(option) => option.disabled === true}
        onChange={(items) => onChange(items.map((option) => option.value))}
        renderItem={(option, handle) => (
          <div className="flex items-center gap-1">
            {handle}
            <Pill
              onRemove={() => toggle(option)}
              removeLabel={removeLabel(option.label)}
              disabled={disabled || readOnly || option.disabled === true}
            >
              {option.label}
            </Pill>
          </div>
        )}
      />
    </div>
  );
}
