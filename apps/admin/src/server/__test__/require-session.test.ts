import { afterEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  session: vi.fn<() => Promise<unknown>>(),
  redirect: vi.fn<(href: string) => never>(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../session', () => ({ getCurrentSession: mocks.session }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import { requireSession } from '../require-session';

afterEach(() => vi.resetAllMocks());

it('returns only the server verified principal', async () => {
  const identity = { id: 'verified-principal' };
  mocks.session.mockResolvedValue({ ok: true, data: identity });
  expect(await requireSession()).toBe(identity);
  expect(mocks.redirect).not.toHaveBeenCalled();
});

it.each([
  [401, 'session_missing', '/login'],
  [401, 'unauthenticated', '/login?reason=expired'],
  [503, 'backend_unavailable', '/login?reason=unavailable'],
])('redirects %s/%s before rendering protected children', async (status, code, href) => {
  mocks.session.mockResolvedValue({ ok: false, status, error: { code } });
  mocks.redirect.mockImplementation((url) => {
    throw new Error(url);
  });
  await expect(requireSession()).rejects.toThrow(href);
  expect(mocks.redirect).toHaveBeenCalledExactlyOnceWith(href);
});
