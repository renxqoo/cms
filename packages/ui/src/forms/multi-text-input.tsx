'use client';

import { useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { Input } from './field.tsx';
import { Button } from '../primitives/button.tsx';
import { SortableList } from '../data/sortable-list.tsx';
import type { SortableLabels } from '../data/sortable-list.tsx';

export interface TextValue {
  id: string;
  value: string;
}

export interface MultiTextInputProps {
  value: readonly TextValue[];
  onChange: (value: TextValue[]) => void;
  createId: () => string;
  labels: {
    inputLabel: string;
    addLabel: string;
    itemLabel: (item: TextValue) => string;
    removeLabel: (item: TextValue) => string;
  };
  sorting: SortableLabels;
  disabled?: boolean;
  readOnly?: boolean;
}

export function MultiTextInput({
  value,
  onChange,
  createId,
  labels,
  sorting,
  disabled = false,
  readOnly = false,
}: MultiTextInputProps) {
  const [draft, setDraft] = useState('');
  function add() {
    if (disabled || readOnly || draft === '') return;
    const id = createId();
    if (!id || value.some((item) => item.id === id)) return;
    onChange([...value, { id, value: draft }]);
    setDraft('');
  }
  return (
    <div className="grid gap-2">
      <SortableList
        items={value}
        getId={(item) => item.id}
        getItemLabel={labels.itemLabel}
        labels={sorting}
        disabled={disabled || readOnly}
        onChange={onChange}
        renderItem={(item, handle) => (
          <div className="flex items-center gap-2">
            {handle}
            <Input
              aria-label={labels.itemLabel(item)}
              value={item.value}
              disabled={disabled}
              readOnly={readOnly}
              onChange={(event) =>
                onChange(
                  value.map((entry) =>
                    entry.id === item.id ? { ...entry, value: event.currentTarget.value } : entry,
                  ),
                )
              }
            />
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label={labels.removeLabel(item)}
              disabled={disabled || readOnly}
              onClick={() => onChange(value.filter((entry) => entry.id !== item.id))}
            >
              <XIcon />
            </Button>
          </div>
        )}
      />
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          aria-label={labels.inputLabel}
          disabled={disabled}
          readOnly={readOnly}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              if (!event.nativeEvent.isComposing) add();
            }
          }}
        />
        <Button
          variant="outline"
          disabled={disabled || readOnly || draft === ''}
          aria-label={labels.addLabel}
          onClick={add}
        >
          <PlusIcon />
          {labels.addLabel}
        </Button>
      </div>
    </div>
  );
}
