import { expect, it } from 'vitest';
import { safeUrl, validLocale } from '../fields.ts';
import { site } from '../site.ts';
it('accepts only safe optional public links and canonical language codes', () => {
  expect(safeUrl('')).toBe(true);
  expect(safeUrl('https://example.com/a')).toBe(true);
  for (const value of [false, 'broken', 'http://example.com', 'https://user:password@example.com'])
    expect(safeUrl(value)).toBe(false);
  expect(validLocale('en-US')).toBe(true);
  expect(validLocale('EN-us')).toBe(false);
  expect(validLocale('not_a_locale')).toBe(false);
});
it('rejects an unversioned API base URL before it can break every generated integration example', () => {
  const validate = site.fields.find((field) => field.name === 'apiBaseUrl')?.validate?.run;
  if (!validate) throw new Error('Missing API base URL policy');
  const context = { data: {}, locale: 'en', mode: 'publish' as const };
  expect(validate('https://api.example.com', context)).toBe(false);
  expect(validate('https://api.example.com/v1', context)).toBe(true);
  expect(validate('http://127.0.0.1:3301/v1', context)).toBe(true);
});
