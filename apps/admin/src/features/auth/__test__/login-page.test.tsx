import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ApiResult } from '../../../api/client';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import LoginPage, { generateMetadata } from '../../../app/(auth)/login/page';
import AuthenticationLayout from '../../../app/(auth)/layout';

const server = vi.hoisted(() => ({
  session: vi.fn<() => Promise<ApiResult<unknown>>>(),
  locale: 'en',
}));
vi.mock('../../../server/session', () => ({ getCurrentSession: server.session }));
vi.mock('next/headers', () => ({
  cookies: () => Promise.resolve({ get: () => ({ value: server.locale }) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (next: string) => {
    throw new Error(`Redirect to ${next}`);
  },
}));

afterEach(() => {
  vi.resetAllMocks();
  server.locale = 'en';
});

function signedOut(code: string, status = 401): ApiResult<unknown> {
  return {
    ok: false,
    status,
    error: { code, message: 'Internal', requestId: '' },
    retryAfterSeconds: null,
    uncertain: false,
  };
}

it('redirects an authenticated login request to a registered site destination', async () => {
  server.session.mockResolvedValue({ ok: true, status: 200, data: {}, requestId: '' });
  await expect(
    LoginPage({ searchParams: Promise.resolve({ next: 'https://external.invalid' }) }),
  ).rejects.toThrow('Redirect to /dashboard');
});

it('renders an ordinary login for a missing cookie without asking the server to mutate cookies', async () => {
  server.session.mockResolvedValue(signedOut('session_missing'));
  const page = await LoginPage({ searchParams: Promise.resolve({}) });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
  );
  expect(markup).toContain('Administrator sign in');
  expect(markup).not.toContain('Checking the expired session');
  expect(markup).toContain('disabled=');
});

it('renders expired cleanup only after the backend has rejected the current cookie', async () => {
  server.session.mockResolvedValue(signedOut('unauthenticated'));
  const page = await LoginPage({ searchParams: Promise.resolve({ next: '/dashboard' }) });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
  );
  expect(markup).toContain('Checking the expired session');
  expect(markup).toContain('disabled=');
});

it('does not pretend a service failure means the user is signed out', async () => {
  server.session.mockResolvedValue(signedOut('service_unavailable', 503));
  const page = await LoginPage({ searchParams: Promise.resolve({ reason: 'expired' }) });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
  );
  expect(markup).toContain('The identity service is temporarily unavailable.');
  expect(markup).not.toContain('Checking the expired session');
});

it('explains an expired redirect even when the stale cookie has already been removed', async () => {
  server.session.mockResolvedValue(signedOut('session_missing'));
  const page = await LoginPage({ searchParams: Promise.resolve({ reason: 'expired' }) });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>,
  );
  expect(markup).toContain('Checking the expired session');
});

it('localizes page metadata and composes the independent authentication layout', async () => {
  expect(await generateMetadata()).toEqual({ title: 'OneAster — Administrator sign in' });
  server.locale = 'zh';
  expect(await generateMetadata()).toEqual({ title: 'OneAster — 管理员登录' });
  const layout = AuthenticationLayout({ children: 'Login content' });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{layout}</ShellProvider>,
  );
  expect(markup).toContain('<main');
  expect(markup).toContain('OneAster');
  expect(markup).toContain('Login content');
});
