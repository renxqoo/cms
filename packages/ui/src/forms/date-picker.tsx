'use client';

import { useId, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import type { Locale } from 'date-fns';
import { CalendarIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import { Button } from '../primitives/button.tsx';
import { buttonStyles } from '../primitives/button-styles.ts';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover.tsx';
import { Input } from './field.tsx';
import {
  changePickerDay,
  changePickerMonth,
  changePickerTime,
  pickerMonth,
  pickerTime,
  validDate,
  withinDateBounds,
} from './date-picker-values.ts';
import type { DatePickerAppearance } from './date-picker-values.ts';

export type { DatePickerAppearance } from './date-picker-values.ts';

export interface DatePickerLabels {
  clear: string;
  time: string;
  previousMonth: string;
  nextMonth: string;
  invalid: string;
  day: (value: Date) => string;
}

export interface DatePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  referenceDate: Date;
  appearance?: DatePickerAppearance;
  label: string;
  placeholder: string;
  labels: DatePickerLabels;
  locale: Locale;
  format: (value: Date, appearance: DatePickerAppearance) => string;
  timeIntervals: number;
  minDate?: Date;
  maxDate?: Date;
  monthsToShow?: 1 | 2;
  readOnly?: boolean;
  disabled?: boolean;
  id?: string;
}

function calendarClasses() {
  return {
    root: 'p-3',
    months: 'relative flex flex-col gap-4 sm:flex-row',
    month: 'flex flex-col gap-2',
    month_caption: 'flex h-8 items-center justify-center text-sm font-medium',
    caption_label: 'select-none',
    nav: 'absolute inset-x-0 top-0 flex justify-between',
    button_previous: buttonStyles({ variant: 'ghost', size: 'icon-sm' }),
    button_next: buttonStyles({ variant: 'ghost', size: 'icon-sm' }),
    chevron: 'size-4 fill-current',
    month_grid: 'w-full border-collapse',
    weekday: 'h-8 w-8 text-center text-xs font-normal text-muted-foreground',
    day: 'p-0 text-center text-sm',
    day_button: `${buttonStyles({ variant: 'ghost', size: 'icon' })} font-normal`,
    selected: '[&>button]:bg-primary [&>button]:text-primary-foreground',
    today: '[&>button]:ring-1 [&>button]:ring-border',
    outside: 'text-muted-foreground/50',
    disabled: 'pointer-events-none opacity-40',
    hidden: 'invisible',
  };
}

function CalendarControl({
  props,
  id,
  open,
  setOpen,
}: {
  props: DatePickerProps;
  id: string;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const appearance = props.appearance ?? 'default';
  const invalid = props.value != null && !withinDateBounds(props.value, appearance, props);
  function selectDay(day: Date) {
    if (props.disabled || props.readOnly) return;
    const next = changePickerDay(day, props.value ?? props.referenceDate, appearance);
    if (!withinDateBounds(next, appearance, props)) return;
    props.onChange(next);
    setOpen(false);
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            disabled={props.disabled === true || props.readOnly === true}
            aria-label={props.label}
            aria-invalid={invalid || undefined}
            className="min-w-0 flex-1 justify-start font-normal"
          >
            <CalendarIcon className="text-muted-foreground" />
            <span className={props.value ? 'truncate' : 'truncate text-muted-foreground'}>
              {props.value ? props.format(props.value, appearance) : props.placeholder}
            </span>
            <ChevronDownIcon className="ml-auto" />
          </Button>
        }
      />
      <PopoverContent className="min-w-0 p-0" aria-label={props.label}>
        <DayPicker
          mode="single"
          required
          timeZone="UTC"
          selected={props.value ?? undefined}
          defaultMonth={props.value ?? props.referenceDate}
          numberOfMonths={props.monthsToShow ?? 1}
          locale={props.locale}
          showOutsideDays
          disabled={[
            ...(props.minDate ? [{ before: props.minDate }] : []),
            ...(props.maxDate ? [{ after: props.maxDate }] : []),
          ]}
          labels={{
            labelPrevious: () => props.labels.previousMonth,
            labelNext: () => props.labels.nextMonth,
            labelDayButton: props.labels.day,
          }}
          onSelect={selectDay}
          classNames={calendarClasses()}
        />
      </PopoverContent>
    </Popover>
  );
}

function PickerInput({ props, id }: { props: DatePickerProps; id: string }) {
  const month = props.appearance === 'monthOnly';
  const display = month ? pickerMonth : pickerTime;
  function bound(date: Date | undefined): string | undefined {
    const anchor = props.value ?? props.referenceDate;
    return date !== undefined &&
      (props.appearance !== 'dayAndTime' ||
        (date.getUTCFullYear() === anchor.getUTCFullYear() &&
          date.getUTCMonth() === anchor.getUTCMonth() &&
          date.getUTCDate() === anchor.getUTCDate()))
      ? display(date)
      : undefined;
  }
  function change(value: string) {
    if (props.disabled || props.readOnly) return;
    if (!value) {
      props.onChange(null);
      return;
    }
    const next = month
      ? changePickerMonth(value)
      : changePickerTime(value, props.value ?? props.referenceDate);
    if (next && withinDateBounds(next, props.appearance ?? 'timeOnly', props)) props.onChange(next);
  }
  return (
    <Input
      id={id}
      type={month ? 'month' : 'time'}
      aria-label={props.appearance === 'dayAndTime' ? props.labels.time : props.label}
      aria-invalid={
        (props.value != null &&
          !withinDateBounds(props.value, props.appearance ?? 'timeOnly', props)) ||
        undefined
      }
      readOnly={props.readOnly}
      disabled={props.disabled}
      value={props.value ? display(props.value) : ''}
      min={bound(props.minDate)}
      max={bound(props.maxDate)}
      step={month ? undefined : props.timeIntervals * 60}
      onChange={(event) => change(event.currentTarget.value)}
      className={props.appearance === 'dayAndTime' ? 'w-32 shrink-0' : 'min-w-0 flex-1'}
    />
  );
}

function invalidConfiguration(props: DatePickerProps): boolean {
  const dates = [props.value, props.referenceDate, props.minDate, props.maxDate];
  return (
    dates.some((date) => date != null && !validDate(date)) ||
    !Number.isInteger(props.timeIntervals) ||
    props.timeIntervals < 1 ||
    props.timeIntervals > 1440 ||
    (props.minDate != null &&
      props.maxDate != null &&
      !withinDateBounds(props.minDate, props.appearance ?? 'default', { maxDate: props.maxDate }))
  );
}

export function DatePicker(props: DatePickerProps) {
  const generated = useId();
  const id = props.id ?? generated;
  const [open, setOpen] = useState(false);
  const appearance = props.appearance ?? 'default';
  if (invalidConfiguration(props)) return <p role="alert">{props.labels.invalid}</p>;
  const inputOnly = appearance === 'monthOnly' || appearance === 'timeOnly';
  const invalid = props.value != null && !withinDateBounds(props.value, appearance, props);
  return (
    <div className="grid min-w-0 gap-2" data-slot="date-picker">
      <label htmlFor={id} className="text-sm font-medium">
        {props.label}
      </label>
      <div className="flex min-w-0 items-center gap-2">
        {inputOnly ? (
          <PickerInput props={props} id={id} />
        ) : (
          <CalendarControl props={props} id={id} open={open} setOpen={setOpen} />
        )}
        {appearance === 'dayAndTime' ? <PickerInput props={props} id={`${id}-time`} /> : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={props.labels.clear}
          disabled={props.value === null || props.disabled === true || props.readOnly === true}
          onClick={() => props.onChange(null)}
        >
          <XIcon aria-hidden="true" />
        </Button>
      </div>
      {invalid ? (
        <p role="alert" className="text-sm text-destructive">
          {props.labels.invalid}
        </p>
      ) : null}
    </div>
  );
}
