import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import AuthorizationRoute from '../../../app/(auth)/authorize/page';
import CredentialsRoute from '../../../app/(admin)/dashboard/account/credentials/page';

const controls = vi.hoisted(() => ({
  session: vi.fn<() => Promise<ApiResult<{ email: string }>>>(),
  requireSession: vi.fn<() => Promise<void>>(),
  redirect: vi.fn<(path: string) => never>(),
  report: vi.fn<() => void>(),
}));
vi.mock('../../../server/session', () => ({ getCurrentSession: controls.session }));
vi.mock('../../../server/require-session', () => ({ requireSession: controls.requireSession }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ reportResult: controls.report }),
}));
vi.mock('next/navigation', () => ({ redirect: controls.redirect }));
afterEach(() => vi.resetAllMocks());

it('requires a verified session before rendering the personal credentials entry', async () => {
  const page = await CredentialsRoute();
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
  );
  expect(markup).toContain('Personal access credentials');
  expect(controls.requireSession).toHaveBeenCalledOnce();
});

it('returns only the verified email to the authorization component', async () => {
  controls.session.mockResolvedValue({
    ok: true,
    status: 200,
    requestId: '',
    data: { email: 'verified@example.test' },
  });
  const page = await AuthorizationRoute({
    searchParams: Promise.resolve({ request: 'opaque-request' }),
  });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
  );
  expect(markup).toContain('verified@example.test');
  expect(markup).toContain('Authorize application access');
  expect(markup).not.toContain('refresh_token');
});

it.each(['session_missing', 'unauthenticated', 'backend_unavailable'])(
  'safely retains a pending authorization through login for %s',
  async (code) => {
    controls.session.mockResolvedValue(failure(code, code === 'backend_unavailable' ? 503 : 401));
    controls.redirect.mockImplementation((path) => {
      throw new Error(path);
    });
    await expect(
      AuthorizationRoute({ searchParams: Promise.resolve({ request: 'opaque-request' }) }),
    ).rejects.toThrow('/login?next=%2Fauthorize%3Frequest%3Dopaque-request');
    const [path] = controls.redirect.mock.calls[0] ?? [];
    expect(new URL(path ?? '', 'https://admin.example.test').searchParams.get('next')).toBe(
      '/authorize?request=opaque-request',
    );
  },
);

it.each([undefined, ['one', 'two'], 'javascript:alert(1)', '../other'])(
  'renders an invalid request without resolving a session for %j',
  async (request) => {
    const page = await AuthorizationRoute({ searchParams: Promise.resolve({ request }) });
    const markup = renderToStaticMarkup(
      <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
    );
    expect(markup).toContain('authorization request is invalid or expired');
    expect(controls.session).not.toHaveBeenCalled();
  },
);
