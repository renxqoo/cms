import { z } from 'zod';
import type { FieldDefinition } from '../definition.ts';

export function optionValues(field: Pick<FieldDefinition, 'options'>): string[] {
  return (field.options ?? []).map((option) =>
    typeof option === 'string' ? option : option.value,
  );
}

export const fieldOptionSchema = z.union([
  z.string().min(1).max(128),
  z.strictObject({
    value: z.string().min(1).max(128),
    label: z.union([z.string().min(1).max(256), z.record(z.string(), z.string().min(1).max(256))]),
  }),
]);
