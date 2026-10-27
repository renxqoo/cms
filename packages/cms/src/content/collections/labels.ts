import { z } from 'zod';
import type { LocalizedLabel } from '../definition.ts';

export const localizedLabelSchema = z.union([
  z.string().min(1).max(128),
  z
    .record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/), z.string().min(1).max(128))
    .refine((value) => Object.keys(value).length > 0),
]);
export function resolveLabel(
  value: LocalizedLabel | undefined,
  locale: string,
  fallback: string,
): string {
  if (typeof value === 'string') return value;
  return value?.[locale] ?? value?.[locale.split('-')[0] ?? ''] ?? fallback;
}

export function localizedTextSchema(maximum: number) {
  const text = z.string().max(maximum);
  return z.union([text, z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/), text)]);
}
