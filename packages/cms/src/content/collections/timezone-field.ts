import { createHash } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';
import { immutable } from '../fields/invoke-function.ts';
import { optionValues } from '../fields/options.ts';
import type { FieldDefinition, FieldOption } from '../definition.ts';

function assertTimezones(options: readonly FieldOption[]): void {
  for (const value of optionValues({ options })) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value }).format();
    } catch {
      fail('invalid_input');
    }
  }
}

function timezoneDefault(options: readonly FieldOption[], configured?: string): string | undefined {
  const values = optionValues({ options });
  const selected = values.length === 1 ? values[0] : configured;
  if (selected !== undefined && !values.includes(selected)) fail('invalid_input');
  return selected;
}

export function timezoneField(field: FieldDefinition): FieldDefinition {
  const configuration = typeof field.timezone === 'object' ? field.timezone : {};
  const options = configuration.supportedTimezones ?? [
    ...new Set(['UTC', ...Intl.supportedValuesOf('timeZone')]),
  ];
  assertTimezones(options);
  const defaultValue = timezoneDefault(options, configuration.defaultTimezone);
  const baseField: FieldDefinition = {
    id: `tz_${createHash('sha256').update(field.id).digest('hex').slice(0, 40)}`,
    name: `${field.name}_tz`,
    type: 'select',
    label: `${field.name} TZ`,
    required: field.required === true || configuration.required === true,
    localized: field.localized === true,
    options,
    ...(defaultValue ? { defaultValue } : {}),
    ...(field.access ? { access: field.access } : {}),
  };
  const overridden =
    configuration.override?.run({
      baseField: Object.freeze({ ...baseField, options: immutable(options) }),
    }) ?? baseField;
  if (
    overridden.id !== baseField.id ||
    overridden.name !== baseField.name ||
    overridden.type !== 'select'
  )
    fail('invalid_input');
  if (!overridden.options) fail('invalid_input');
  assertTimezones(overridden.options);
  return { ...overridden, timezoneFor: field.id };
}
