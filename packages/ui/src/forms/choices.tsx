'use client';

import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox';
import { RadioGroup as BaseRadioGroup } from '@base-ui/react/radio-group';
import { Radio as BaseRadio } from '@base-ui/react/radio';
import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { cn } from '../cn.ts';

export interface CheckboxProps extends BaseCheckbox.Root.Props {
  label: string;
}

export function Checkbox({ label, className, indeterminate, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50">
      <BaseCheckbox.Root
        {...props}
        indeterminate={indeterminate}
        aria-label={label}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-input bg-transparent outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground',
          className,
        )}
      >
        <BaseCheckbox.Indicator className="[&_svg]:size-3.5">
          {indeterminate ? <MinusIcon /> : <CheckIcon />}
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      <span>{label}</span>
    </label>
  );
}

export interface RadioOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  label: string;
  options: readonly RadioOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  name?: string;
  disabled?: boolean;
  readOnly?: boolean;
}

export function RadioGroup({
  label,
  options,
  value,
  onValueChange,
  name,
  disabled,
  readOnly,
}: RadioGroupProps) {
  return (
    <BaseRadioGroup
      value={value}
      onValueChange={(next) => {
        if (next !== null) onValueChange(next);
      }}
      name={name}
      disabled={disabled}
      readOnly={readOnly}
      aria-label={label}
      className="grid gap-2"
    >
      {options.map((option) => (
        <label
          key={option.value}
          className="inline-flex w-fit cursor-pointer items-center gap-2 text-sm has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50"
        >
          <BaseRadio.Root
            value={option.value}
            disabled={option.disabled}
            aria-label={option.label}
            className="flex size-4 items-center justify-center rounded-full border border-input outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:border-primary"
          >
            <BaseRadio.Indicator className="size-2 rounded-full bg-primary" />
          </BaseRadio.Root>
          {option.label}
        </label>
      ))}
    </BaseRadioGroup>
  );
}

export interface SwitchProps extends BaseSwitch.Root.Props {
  label: string;
}

export function Switch({ label, className, ...props }: SwitchProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm has-data-disabled:cursor-not-allowed has-data-disabled:opacity-50">
      <BaseSwitch.Root
        {...props}
        aria-label={label}
        className={cn(
          'flex h-4 w-7 shrink-0 items-center rounded-full border border-transparent bg-input p-px outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-disabled:opacity-50',
          className,
        )}
      >
        <BaseSwitch.Thumb className="size-3 rounded-full bg-background shadow-xs transition-transform data-checked:translate-x-3 motion-reduce:transition-none" />
      </BaseSwitch.Root>
      {label}
    </label>
  );
}
