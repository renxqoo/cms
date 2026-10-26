import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import type { Me } from '../../../contracts/auth';
import type { ApiResult } from '../../../api/client';
import { failure } from '../../../api/result';
import { AdminShell } from '../admin-shell';
import { Dashboard } from '../dashboard';
import { useSessionActions } from '../session-actions';
import { sessionMessages } from '../session-messages';

const mocks = vi.hoisted(() => ({
  request: vi.fn<(input: { signal: AbortSignal }) => Promise<ApiResult<undefined>>>(),
  replace: vi.fn<() => void>(),
}));
vi.mock('../../../api/client', () => ({
  requestApi: (input: { operation: string; signal: AbortSignal }) => {
    if (input.operation === 'access.myOperations')
      return Promise.resolve({
        ok: true,
        status: 200,
        requestId: '',
        data: { rows: [], total: 0, page: 1, pageSize: 100 },
      });
    if (input.operation === 'access.myNavigation')
      return Promise.resolve({ ok: true, status: 200, requestId: '', data: { rows: [] } });
    return mocks.request(input);
  },
}));
vi.mock('../session-navigation', () => ({ replaceAfterSignOut: mocks.replace }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));

const principal: Me = {
  id: '1e2bc49f-9f00-4c24-b090-d38adfc231f6',
  version: 1,
  email: 'owner@example.test',
  displayName: 'Account owner',
  roleId: 'c5f7ad61-48c7-4885-823a-e7cf7c36a7d6',
  roleCode: 'super_admin',
  status: 'active',
  activation: 'activated',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
  lastLoginAt: null,
  role: {
    id: 'c5f7ad61-48c7-4885-823a-e7cf7c36a7d6',
    code: 'super_admin',
    name: 'Super admin',
    status: 'active',
    isSuper: true,
  },
};

function view(locale: 'zh' | 'en' = 'en', value = principal) {
  return render(
    <ShellProvider initial={parsePreferences({ locale })}>
      <AdminShell principal={value}>
        <Dashboard principal={value} />
      </AdminShell>
    </ShellProvider>,
  );
}

async function signOut() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
}

afterEach(() => vi.resetAllMocks());

it.each(['zh', 'en'] as const)(
  'shows only the verified principal in the shared %s production shell',
  async (locale) => {
    view(locale);
    const t = sessionMessages[locale];
    expect(screen.getByRole('heading', { level: 1, name: t.dashboard })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.current })).toBeInTheDocument();
    expect(screen.getAllByText('owner@example.test').length).toBeGreaterThan(0);
    expect(screen.getByText('Super admin')).toBeInTheDocument();
    expect(screen.queryByText('Component workbench')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.dashboard })).toHaveAttribute('href', '/dashboard');
    await waitFor(() =>
      expect(
        screen.queryByText(locale === 'en' ? 'Checking access…' : '正在核对访问权限…'),
      ).not.toBeInTheDocument(),
    );
  },
);

it('uses the email for an unset account name and keeps a readable fallback in the profile', async () => {
  view('en', { ...principal, displayName: null });
  expect(screen.getByText('Name not set')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  expect(screen.getAllByText('owner@example.test').length).toBeGreaterThan(2);
});

it('removes protected content during logout and keeps duplicate attempts locked until full navigation', async () => {
  let resolve: ((value: ApiResult<undefined>) => void) | undefined;
  mocks.request.mockImplementation(
    () =>
      new Promise<ApiResult<undefined>>((done) => {
        resolve = done;
      }),
  );
  view();
  await signOut();
  expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
  expect(screen.getByText('Signing out…')).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
});

it('does not claim logout succeeded when the request is uncertain and allows a bounded retry', async () => {
  mocks.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce({ ok: true, status: 204, data: undefined, requestId: '' });
  view();
  await signOut();
  expect(await screen.findByText(sessionMessages.en.uncertain)).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
  const retry = screen.getByRole('button', { name: 'Retry sign out' });
  fireEvent.click(retry);
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it('navigates away when the server confirms the session is already unauthenticated', async () => {
  mocks.request.mockResolvedValue(failure('unauthenticated', 401));
  view();
  await signOut();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
});

it.each([
  [401, 'invalid_credentials'],
  [403, 'forbidden'],
  [503, 'backend_unavailable'],
] as const)('keeps logout failure HTTP %s/%s visible for retry', async (status, code) => {
  mocks.request.mockResolvedValue(failure(code, status));
  view();
  await signOut();
  expect(await screen.findByRole('button', { name: 'Retry sign out' })).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it('aborts an in-flight logout on unmount and ignores its late result', async () => {
  let resolve: ((value: ApiResult<undefined>) => void) | undefined;
  let signal: AbortSignal | undefined;
  mocks.request.mockImplementation((input: { signal: AbortSignal }) => {
    ({ signal } = input);
    return new Promise<ApiResult<undefined>>((done) => {
      resolve = done;
    });
  });
  const component = view();
  await signOut();
  component.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(mocks.replace).not.toHaveBeenCalled();
});

function SignOutChild() {
  const actions = useSessionActions();
  return <button onClick={() => void actions.signOut()}>Verify changed password</button>;
}

it('uses the same whole-page logout action from account content and the header menu', async () => {
  mocks.request.mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <AdminShell principal={principal}>
        <SignOutChild />
      </AdminShell>
    </ShellProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verify changed password' }));
  expect(await screen.findByText(sessionMessages.en.uncertain)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verify changed password' })).not.toBeInTheDocument();
  expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledOnce();
});

it('rejects session actions outside the shared administrative boundary', () => {
  expect(() => render(<SignOutChild />)).toThrow('SessionActionsProvider is required');
});
