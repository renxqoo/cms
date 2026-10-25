import { afterEach, expect, it, vi } from 'vitest';
import { checkLoginSession, replaceAfterLogin, safeLoginNext } from '../login-navigation';

afterEach(() => vi.unstubAllGlobals());

it.each([
  undefined,
  null,
  '',
  ['https://external.invalid'],
  'https://external.invalid',
  '//external.invalid',
  '/dashboard/unknown',
  '/dashboard?next=https://external.invalid',
  '/dashboard#private',
  '/dashboard/../ui',
  '/dashboard%2funknown',
  '/dashboard\\unknown',
  '/dashboard\n',
  '/ui',
])('rejects unregistered return targets %s', (value) => {
  expect(safeLoginNext(value)).toBe('/dashboard');
});

it('performs a complete replacement for the registered dashboard target', () => {
  const replace = vi.fn<(value: string) => void>();
  const reload = vi.fn<() => void>();
  vi.stubGlobal('window', { location: { replace, reload } });
  replaceAfterLogin('/dashboard');
  expect(replace).toHaveBeenCalledWith('/dashboard');
  checkLoginSession();
  expect(reload).toHaveBeenCalledOnce();
});
