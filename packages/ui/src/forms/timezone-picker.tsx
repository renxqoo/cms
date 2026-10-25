'use client';

import { Select } from './select.tsx';
import type { SelectOption, SelectProps } from './select-types.ts';

export type TimezonePickerProps = Omit<Extract<SelectProps, { multiple?: false }>, 'options'> & {
  timezones: readonly SelectOption[];
};

export function TimezonePicker({ timezones, ...props }: TimezonePickerProps) {
  return <Select {...props} options={timezones} />;
}
