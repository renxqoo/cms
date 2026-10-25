'use client';

import { useEffect, useRef } from 'react';
import { SearchIcon, XIcon } from 'lucide-react';
import { Button } from '../primitives/button.tsx';
import { Input } from './field.tsx';

export interface SearchBarProps {
  value: string;
  onValueChange: (value: string) => void;
  onSearch: (value: string) => void;
  mode: { type: 'submit' } | { type: 'debounced'; delayMs: number };
  label: string;
  searchLabel: string;
  clearLabel: string;
  placeholder: string;
  disabled?: boolean;
}

export function SearchBar({
  value,
  onValueChange,
  onSearch,
  mode,
  label,
  searchLabel,
  clearLabel,
  placeholder,
  disabled,
}: SearchBarProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composing = useRef(false);
  const lastSearch = useRef<string | null>(value);
  const localValue = useRef(value);
  const latestSearch = useRef(onSearch);
  const delayMs = mode.type === 'debounced' ? mode.delayMs : 0;
  function cancel() {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => {
    if (localValue.current !== value) {
      localValue.current = value;
      lastSearch.current = value;
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    }
  }, [value]);
  useEffect(() => {
    latestSearch.current = onSearch;
  }, [onSearch]);
  useEffect(() => {
    if ((disabled || mode.type === 'submit' || delayMs < 0) && timer.current !== null)
      clearTimeout(timer.current);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [disabled, mode.type, delayMs]);
  function search(next: string) {
    cancel();
    if (lastSearch.current === next) return;
    lastSearch.current = next;
    latestSearch.current(next);
  }
  function schedule(next: string) {
    cancel();
    if (mode.type !== 'debounced' || composing.current) return;
    timer.current = setTimeout(() => search(next), Math.max(0, delayMs));
  }
  return (
    <form
      role="search"
      className="flex w-full min-w-0 items-center gap-2 sm:max-w-lg"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled && !composing.current) search(value);
      }}
    >
      <div className="relative min-w-0 flex-1">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label={label}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-9"
          onCompositionStart={() => {
            composing.current = true;
            cancel();
          }}
          onCompositionEnd={(event) => {
            composing.current = false;
            schedule(event.currentTarget.value);
          }}
          onChange={(event) => {
            const next = event.currentTarget.value;
            localValue.current = next;
            onValueChange(next);
            schedule(next);
          }}
        />
      </div>
      <Button type="submit" variant="outline" disabled={disabled} aria-label={searchLabel}>
        <SearchIcon />
        <span className="hidden sm:inline">{searchLabel}</span>
      </Button>
      {value ? (
        <Button
          size="icon"
          variant="ghost"
          disabled={disabled}
          aria-label={clearLabel}
          onClick={() => {
            localValue.current = '';
            onValueChange('');
            search('');
          }}
        >
          <XIcon />
        </Button>
      ) : null}
    </form>
  );
}
