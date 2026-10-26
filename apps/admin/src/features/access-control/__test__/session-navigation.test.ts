import { afterEach, expect, it, vi } from 'vitest';
import { reloadRestoredSession, replaceExpiredSession } from '../session-navigation';

afterEach(() => vi.unstubAllGlobals());
it('uses complete document navigation for confirmed expiry and persisted identity restoration', () => {
  const replace = vi.fn<(href: string) => void>();
  const reload = vi.fn<() => void>();
  vi.stubGlobal('window', { location: { replace, reload } });
  replaceExpiredSession();
  reloadRestoredSession();
  expect(replace).toHaveBeenCalledExactlyOnceWith('/login?reason=expired');
  expect(reload).toHaveBeenCalledOnce();
});
