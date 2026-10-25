'use client';

import { Combobox as BaseCombobox } from '@base-ui/react/combobox';
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Input, useFieldControl } from './field.tsx';
import { Button } from '../primitives/button.tsx';
import { Pill } from '../feedback/pill.tsx';
import { Spinner } from '../feedback/status.tsx';
import { SortableList } from '../data/sortable-list.tsx';
import { useSelectOptions } from './select-options.ts';
import type { SelectOption, SelectProps } from './select-types.ts';

function SelectedOptions({
  props,
  options,
}: {
  props: SelectProps;
  options: readonly SelectOption[];
}) {
  if (!props.multiple) return null;
  const selected = props.value.map(
    (key) => options.find((option) => option.value === key) ?? { value: key, label: key },
  );
  return (
    <SortableList
      items={selected}
      getId={(option) => option.value}
      getItemLabel={(option) => option.label}
      labels={props.sorting}
      orientation="horizontal"
      disabled={props.disabled === true || props.readOnly === true}
      isItemDisabled={(option) => option.disabled === true}
      onChange={(items) => props.onChange(items.map((option) => option.value))}
      renderItem={(option, handle) => (
        <div className="flex items-center gap-1">
          {handle}
          <Pill
            dot={false}
            removeLabel={props.removeLabel(option.label)}
            disabled={
              props.disabled === true || props.readOnly === true || option.disabled === true
            }
            onRemove={() => props.onChange(props.value.filter((key) => key !== option.value))}
          >
            {option.label}
          </Pill>
        </div>
      )}
    />
  );
}

function OptionItems({ options }: { options: readonly SelectOption[] }) {
  const groups = [...new Set(options.map((option) => option.group))];
  return groups.map((group) => (
    <BaseCombobox.Group key={group ?? ''}>
      {group ? (
        <BaseCombobox.GroupLabel className="px-2 py-1 text-xs text-muted-foreground">
          {group}
        </BaseCombobox.GroupLabel>
      ) : null}
      {options
        .filter((option) => option.group === group)
        .map((option) => (
          <BaseCombobox.Item
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            className="relative flex cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm outline-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground"
          >
            {option.label}
            <BaseCombobox.ItemIndicator className="absolute right-2">
              <CheckIcon className="size-3.5" />
            </BaseCombobox.ItemIndicator>
          </BaseCombobox.Item>
        ))}
    </BaseCombobox.Group>
  ));
}

export function Select(props: SelectProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<readonly SelectOption[]>([]);
  const [creating, setCreating] = useState<AbortController | null>(null);
  const [createError, setCreateError] = useState<{
    controller: AbortController;
    message: string;
  } | null>(null);
  const current = useRef<AbortController | null>(null);
  const remote = useSelectOptions(props, query, open);
  const options = [
    ...new Map(
      [...remote.selected, ...created, ...props.options, ...remote.options].map((option) => [
        option.value,
        option,
      ]),
    ).values(),
  ];
  const available = [
    ...new Map([...created, ...remote.options].map((option) => [option.value, option])).values(),
  ];
  const filtered = remote.loading
    ? []
    : available.filter((option) =>
        option.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      );
  const busy = creating !== null && !creating.signal.aborted;
  const locked = props.disabled === true || props.readOnly === true;
  const error =
    createError && !createError.controller.signal.aborted ? createError.message : remote.error;
  useEffect(
    () => () => {
      current.current?.abort();
    },
    [],
  );
  function changeOpen(next: boolean) {
    if (!next) {
      current.current?.abort();
      creating?.abort();
      createError?.controller.abort();
    }
    setOpen(next);
  }
  function changeValue(value: string | string[] | null) {
    if (locked) return;
    if (props.multiple)
      props.onChange(Array.isArray(value) ? value : value === null ? [] : [value]);
    else props.onChange(Array.isArray(value) ? (value[0] ?? null) : value);
    setQuery('');
  }
  async function create() {
    if (!props.onCreate || locked || (current.current && !current.current.signal.aborted)) return;
    const controller = new AbortController();
    current.current = controller;
    setCreating(controller);
    setCreateError(null);
    try {
      const result = await props.onCreate({ query, signal: controller.signal });
      if (controller.signal.aborted) return;
      current.current = null;
      setCreating(null);
      if (result.status === 'error') {
        setCreateError({ controller, message: result.message });
        return;
      }
      setCreated((items) => [
        ...items.filter((item) => item.value !== result.option.value),
        result.option,
      ]);
      changeValue(
        props.multiple
          ? [...props.value.filter((key) => key !== result.option.value), result.option.value]
          : result.option.value,
      );
    } catch {
      if (!controller.signal.aborted) {
        current.current = null;
        setCreating(null);
        setCreateError({ controller, message: props.errorLabel });
      }
    }
  }
  return (
    <SelectView
      props={props}
      model={{
        options,
        filtered,
        busy,
        locked,
        error,
        query,
        open,
        remoteLoading: remote.loading,
        changeOpen,
        changeValue,
        setQuery,
        create,
      }}
    />
  );
}

interface SelectViewModel {
  options: readonly SelectOption[];
  filtered: readonly SelectOption[];
  busy: boolean;
  locked: boolean;
  error: string | null | undefined;
  query: string;
  open: boolean;
  remoteLoading: boolean;
  changeOpen: (open: boolean) => void;
  changeValue: (value: string | string[] | null) => void;
  setQuery: (value: string) => void;
  create: () => Promise<void>;
}

function creationLabel(
  props: SelectProps,
  query: string,
  options: readonly SelectOption[],
): string | null {
  if (!props.onCreate || !props.createLabel || query === '') return null;
  if (options.some((option) => option.label.toLocaleLowerCase() === query.toLocaleLowerCase()))
    return null;
  return props.createLabel(query);
}

function SelectControl({ props, model }: { props: SelectProps; model: SelectViewModel }) {
  const field = useFieldControl();
  const summaryId = useId();
  const selected = props.multiple ? props.value : props.value === null ? [] : [props.value];
  const selectedText = selected
    .map((key) => model.options.find((option) => option.value === key)?.label ?? key)
    .join(', ');
  const description = [field?.describedBy, summaryId].filter(Boolean).join(' ');
  return (
    <div className="relative">
      <BaseCombobox.Trigger
        id={field?.id}
        render={<Button variant="outline" className="w-full justify-between pr-14 font-normal" />}
        aria-label={props.label}
        aria-describedby={description}
        aria-invalid={field?.error ? true : undefined}
        disabled={model.locked || model.busy}
      >
        <span id={summaryId} className="min-w-0 truncate">
          {selectedText || props.placeholder}
        </span>
        <ChevronDownIcon aria-hidden="true" />
      </BaseCombobox.Trigger>
      {selected.length > 0 ? (
        <BaseCombobox.Clear
          render={<Button variant="ghost" size="icon-xs" className="absolute top-1 right-7" />}
          aria-label={props.clearLabel}
          disabled={model.locked || model.busy}
        >
          <XIcon />
        </BaseCombobox.Clear>
      ) : null}
    </div>
  );
}

function SelectPopup({ props, model }: { props: SelectProps; model: SelectViewModel }) {
  const field = useFieldControl();
  const search = useRef<HTMLInputElement>(null);
  const createText = creationLabel(props, model.query, model.options);
  return (
    <BaseCombobox.Portal>
      <BaseCombobox.Positioner sideOffset={4} align="start" className="z-50">
        <BaseCombobox.Popup
          aria-label={props.label}
          initialFocus={search}
          finalFocus
          className="max-h-(--available-height) w-(--anchor-width) min-w-48 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
        >
          <BaseCombobox.Input
            ref={search}
            render={
              <Input
                id={field ? `${field.id}-search` : undefined}
                name={undefined}
                required={false}
              />
            }
            aria-label={props.label}
            placeholder={props.placeholder}
            disabled={props.disabled === true || model.busy}
            className="mb-1 w-full"
          />
          <BaseCombobox.List>
            <OptionItems options={model.filtered} />
          </BaseCombobox.List>
          {model.remoteLoading ? (
            <span role="status" className="flex items-center gap-2 p-2 text-sm">
              <Spinner />
              {props.loadingLabel}
            </span>
          ) : model.filtered.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">{props.emptyLabel}</p>
          ) : null}
          {createText ? (
            <Button
              variant="ghost"
              busy={model.busy}
              disabled={model.locked || model.remoteLoading}
              onClick={() => {
                void model.create();
              }}
            >
              {createText}
            </Button>
          ) : null}
          {model.error ? (
            <p role="alert" className="p-2 text-sm text-destructive">
              {model.error}
            </p>
          ) : null}
        </BaseCombobox.Popup>
      </BaseCombobox.Positioner>
    </BaseCombobox.Portal>
  );
}

function SelectView({ props, model }: { props: SelectProps; model: SelectViewModel }) {
  const field = useFieldControl();
  return (
    <div className="grid gap-2">
      <BaseCombobox.Root<string, boolean>
        items={model.filtered.map((option) => option.value)}
        filter={null}
        multiple={props.multiple ?? false}
        value={props.value}
        onValueChange={model.changeValue}
        inputValue={model.query}
        onInputValueChange={model.setQuery}
        itemToStringLabel={(key) =>
          model.options.find((option) => option.value === key)?.label ?? key
        }
        disabled={props.disabled}
        readOnly={props.readOnly}
        name={props.name ?? field?.name}
        required={field?.required}
        open={model.open}
        onOpenChange={model.changeOpen}
      >
        <SelectControl props={props} model={model} />
        <SelectedOptions props={props} options={model.options} />
        <SelectPopup props={props} model={model} />
      </BaseCombobox.Root>
      {model.error && !model.open ? (
        <p role="alert" className="text-sm text-destructive">
          {model.error}
        </p>
      ) : null}
    </div>
  );
}
