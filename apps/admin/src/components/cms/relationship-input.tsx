'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Button } from '@new-cms/ui/actions';
import { Input, NativeSelect } from '@new-cms/ui/forms';
import { Drawer } from '@new-cms/ui/overlays';
import { useRelationshipOptions } from './use-relationship-options';
import { relationshipKey, relationshipValues } from './relationship-types';
import type { RelationshipInputProps, RelationshipOption } from './relationship-types';
import { RelationshipSelection } from './relationship-selection';

function pickOption(props: RelationshipInputProps, option: RelationshipOption) {
  if (props.readOnly === true || option.disabled === true || option.available === false) return;
  const value = {
    collection: option.collection,
    id: option.id,
    label: option.label,
    ...(option.previewUrl ? { previewUrl: option.previewUrl } : {}),
  };
  if (props.mode === 'single') props.onChange(value);
  else {
    const selected = props.value.some((item) => relationshipKey(item) === relationshipKey(option));
    if (selected)
      props.onChange(
        props.value.filter((item) => relationshipKey(item) !== relationshipKey(option)),
      );
    else if (props.value.length < props.maxRows) props.onChange([...props.value, value]);
  }
}

function optionKey(event: KeyboardEvent<HTMLDivElement>) {
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const buttons = Array.from(
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)'),
  );
  const active = buttons.findIndex((button) => button === document.activeElement);
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : (active + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[index]?.focus();
  event.preventDefault();
}

function OptionList({
  props,
  options,
}: {
  props: RelationshipInputProps;
  options: readonly RelationshipOption[];
}) {
  const values = relationshipValues(props);

  return (
    <div
      role="listbox"
      aria-label={`${props.label} ${props.labels.chooseExisting}`}
      aria-multiselectable={props.mode === 'multiple'}
      className="max-h-60 overflow-y-auto rounded-lg border border-border/60 p-1"
      onKeyDown={optionKey}
    >
      {options.map((option) => {
        const selected = values.some((value) => relationshipKey(value) === relationshipKey(option));
        const full = props.mode === 'multiple' && values.length >= props.maxRows;
        return (
          <Button
            key={relationshipKey(option)}
            role="option"
            aria-selected={selected}
            aria-label={`${props.collections.find((collection) => collection.id === option.collection)?.label ?? option.collection}: ${option.label}`}
            variant={selected ? 'secondary' : 'ghost'}
            className="mb-1 w-full justify-start whitespace-normal text-left last:mb-0"
            disabled={
              props.readOnly === true ||
              option.disabled === true ||
              option.available === false ||
              (full && !selected)
            }
            onClick={() => pickOption(props, option)}
          >
            {option.label}
          </Button>
        );
      })}
    </div>
  );
}

function RelationshipBrowser({ props }: { props: RelationshipInputProps }) {
  const [query, setQuery] = useState('');
  const [collection, setCollection] = useState<string | null>(null);
  const results = useRelationshipOptions(props, query, collection);
  const region = useRef<HTMLDivElement>(null);
  return (
    <div className="space-y-3" ref={region}>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label={props.labels.search}
          placeholder={props.labels.search}
          value={query}
          disabled={props.readOnly}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              region.current
                ?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)')
                ?.focus();
              event.preventDefault();
            }
          }}
        />
        {props.collections.length > 1 ? (
          <NativeSelect
            aria-label={props.labels.collection}
            value={collection ?? ''}
            disabled={props.readOnly}
            onChange={(event) => setCollection(event.currentTarget.value || null)}
          >
            <option value="">{props.labels.collection}</option>
            {props.collections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {results.status === 'loading' ? (
        <p role="status" className="text-sm text-muted-foreground">
          {props.labels.loading}
        </p>
      ) : results.status === 'error' ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>{props.labels.error}</p>
          <Button variant="outline" onClick={results.retry}>
            {props.labels.retry}
          </Button>
        </div>
      ) : results.options.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.labels.empty}</p>
      ) : (
        <OptionList props={props} options={results.options} />
      )}
    </div>
  );
}

export function RelationshipInput(props: RelationshipInputProps) {
  const [open, setOpen] = useState(false);
  const values = relationshipValues(props);
  return (
    <fieldset className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-medium">{props.label}</legend>
      <RelationshipSelection props={props} />
      {!props.readOnly ? (
        <>
          {props.appearance === 'select' ? (
            <RelationshipBrowser props={props} />
          ) : (
            <Button variant="outline" onClick={() => setOpen(true)}>
              {props.labels.chooseExisting}
            </Button>
          )}
          {props.mode === 'multiple' && values.length >= props.maxRows ? (
            <p role="status" className="text-sm text-muted-foreground">
              {props.labels.maximum}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {values.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (props.mode === 'single') props.onChange(null);
                  else props.onChange([]);
                }}
              >
                {props.labels.clear}
              </Button>
            ) : null}
            {props.onCreate
              ? props.collections.map((collection) => (
                  <Button
                    key={collection.id}
                    variant="outline"
                    size="sm"
                    onClick={() => props.onCreate?.(collection.id)}
                  >
                    {props.labels.create} {collection.label}
                  </Button>
                ))
              : null}
          </div>
        </>
      ) : null}
      <Drawer
        open={open && !props.readOnly}
        onOpenChange={setOpen}
        title={props.label}
        closeLabel={props.labels.close}
      >
        <RelationshipBrowser props={props} />
      </Drawer>
    </fieldset>
  );
}

export type {
  RelationshipInputProps,
  RelationshipValue,
  RelationshipOption,
  RelationshipLabels,
  RelationshipQuery,
} from './relationship-types';
