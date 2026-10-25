import { z } from 'zod';

function localPath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  try {
    const base = 'https://cms-navigation.invalid';
    const parsed = new URL(value, base);
    const decoded = decodeURIComponent(value);
    return (
      parsed.origin === base &&
      parsed.pathname === value &&
      parsed.search === '' &&
      parsed.hash === '' &&
      !decoded.startsWith('//') &&
      !decoded.includes('\\') &&
      !Array.from(decoded).some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    );
  } catch {
    return false;
  }
}

export const navigationPathsSchema = z
  .array(z.string().min(1).max(255).refine(localPath))
  .refine((values) => new Set(values).size === values.length);
export const navigationIconsSchema = z
  .array(
    z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  )
  .refine((values) => new Set(values).size === values.length);
