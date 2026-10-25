import { afterEach, expect, it, vi } from 'vitest';
import { replaceAfterSignOut } from '../session-navigation';

afterEach(() => vi.unstubAllGlobals());

it('replaces the full document so authenticated router state cannot survive logout', () => {
  const replace = vi.fn<(href: string) => void>();
  vi.stubGlobal('window', { location: { replace } });
  replaceAfterSignOut();
  expect(replace).toHaveBeenCalledExactlyOnceWith('/login');
});
