import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import type { Me } from '../../../contracts/auth';
import { failure } from '../../../api/result';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { createNavigationController } from '../../../components/shell/navigation/controller';
import { parsePreferences } from '../../../config/preferences';
import AccountRoute from '../../../app/(admin)/dashboard/account/page';
import { AccountPage } from '../account-page';

const controls = vi.hoisted(() => ({
  session: vi.fn<() => Promise<Me>>(),
  request:
    vi.fn<
      (input: {
        operation: string;
        body?: unknown;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  refresh: vi.fn<() => void>(),
  replace: vi.fn<() => void>(),
  signOut: vi.fn<() => Promise<void>>(),
  navigation: null as ReturnType<typeof createNavigationController> | null,
}));
vi.mock('../../../server/require-session', () => ({ requireSession: controls.session }));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ reportResult: controls.report }),
}));
vi.mock('../../session/session-actions', () => ({
  useSessionActions: () => ({ signOut: controls.signOut, completeSignOut: controls.replace }),
}));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => {
    if (!controls.navigation) throw new Error('Missing navigation fixture');
    return controls.navigation;
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: controls.refresh }) }));

const principal: Me = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  displayName: 'Original owner',
  version: 4,
  roleId: '20000000-0000-4000-8000-000000000001',
  roleCode: 'editor',
  status: 'active',
  activation: 'activated',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  lastLoginAt: null,
  role: {
    id: '20000000-0000-4000-8000-000000000001',
    code: 'editor',
    name: 'Editors',
    status: 'active',
    isSuper: false,
  },
};

beforeEach(() => {
  controls.navigation = createNavigationController('/dashboard/account');
});
afterEach(() => {
  controls.navigation?.dispose();
  vi.resetAllMocks();
});

function content(value = principal, locale: 'zh' | 'en' = 'en') {
  return (
    <ShellProvider initial={parsePreferences({ locale })}>
      <AccountPage principal={value} />
    </ShellProvider>
  );
}
function view(value = principal, locale: 'zh' | 'en' = 'en') {
  return render(content(value, locale));
}
function profileName(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value } });
}
function saveProfile() {
  fireEvent.submit(screen.getByRole('form', { name: 'Profile' }));
}
function passwordValues(
  current = 'original password',
  next = '  a long new password  ',
  confirm = next,
) {
  fireEvent.change(screen.getByLabelText(/^Current password/), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/^Confirm new password/), { target: { value: confirm } });
}
function changePassword() {
  fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
}

it('keeps a disabled-role account self-service usable without management grants', () => {
  view({ ...principal, role: { ...principal.role, status: 'disabled' } });
  expect(screen.getByRole('heading', { name: 'Account settings' })).toBeInTheDocument();
  expect(screen.getByText('owner@example.test')).toBeInTheDocument();
  expect(screen.getByText('Disabled')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Change password and sign in again' })).toBeEnabled();
});

it('does not call the profile API for an unchanged name and validates the maximum length', () => {
  view();
  saveProfile();
  expect(screen.getByText('Your profile has no changes.')).toBeInTheDocument();
  profileName('x'.repeat(65));
  saveProfile();
  expect(
    screen.getByText('Use no more than 64 characters for your display name.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
  expect(controls.request).not.toHaveBeenCalled();
});

it.each([
  ['New name', 'New name'],
  ['', null],
  ['  spaced name  ', '  spaced name  '],
] as const)('saves the exact name %s with a server CAS version', async (entered, expected) => {
  controls.request.mockResolvedValue({
    ok: true,
    status: 200,
    data: { ...principal, displayName: expected, version: 5 },
    requestId: '',
  });
  view();
  profileName(entered);
  saveProfile();
  expect(await screen.findByText('Your profile is saved.')).toBeInTheDocument();
  expect(controls.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'access.updateOwnProfile',
    body: { version: 4, displayName: expected },
  });
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue(entered);
  expect(controls.refresh).toHaveBeenCalledOnce();
});

it('regression: a background profile refresh must not silently promote the CAS version of a dirty draft', async () => {
  controls.request.mockResolvedValue(failure('version_conflict', 409));
  const rendered = view();
  profileName('My unsaved draft');
  rendered.rerender(
    content({ ...principal, version: 5, displayName: 'Changed by another request' }),
  );
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('My unsaved draft');
  saveProfile();
  await waitFor(() => expect(controls.request).toHaveBeenCalledOnce());
  expect(controls.request.mock.calls[0]?.[0].body).toEqual({
    version: 4,
    displayName: 'My unsaved draft',
  });
});

it('keeps a conflicting profile draft locked until the current version is read and explicitly accepted', async () => {
  controls.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...principal, version: 8, displayName: 'Remote name' },
      requestId: '',
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...principal, version: 9, displayName: 'My draft' },
      requestId: '',
    });
  view();
  profileName('My draft');
  saveProfile();
  expect(await screen.findByText(/Your draft is preserved/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Read current profile' }));
  expect(await screen.findByText('Current server name: Remote name')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('My draft');
  fireEvent.click(screen.getByRole('button', { name: 'Continue with the current version' }));
  saveProfile();
  expect(await screen.findByText('Your profile is saved.')).toBeInTheDocument();
  expect(controls.request.mock.calls[2]?.[0].body).toEqual({ version: 8, displayName: 'My draft' });
});

it('verifies an uncertain profile response by reading current data instead of replaying the write', async () => {
  controls.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { ...principal, version: 5, displayName: 'Desired name' },
      requestId: '',
    });
  view();
  profileName('Desired name');
  saveProfile();
  expect(await screen.findByRole('button', { name: 'Read current profile' })).toBeInTheDocument();
  saveProfile();
  expect(controls.request).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Read current profile' }));
  expect(
    await screen.findByText('The current profile matches the submitted changes.'),
  ).toBeInTheDocument();
  expect(controls.request.mock.calls.map(([input]) => input.operation)).toEqual([
    'access.updateOwnProfile',
    'access.me',
  ]);
});

it('keeps the original conflict and draft when rereading the profile fails', async () => {
  controls.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(failure('backend_unavailable', 503));
  view();
  profileName('Preserved draft');
  saveProfile();
  fireEvent.click(await screen.findByRole('button', { name: 'Read current profile' }));
  await waitFor(() => expect(controls.report).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Preserved draft');
  expect(screen.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Continue with the current version' }),
  ).not.toBeInTheDocument();
});

it('blocks duplicate profile submits and aborts an in-flight write on unmount', () => {
  controls.request.mockImplementation(() => new Promise(() => {}));
  const rendered = view();
  profileName('Pending name');
  saveProfile();
  saveProfile();
  expect(controls.request).toHaveBeenCalledOnce();
  rendered.unmount();
  expect(controls.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
});

it('preserves a password error and does not sign out for invalid current credentials', async () => {
  controls.request.mockResolvedValue(failure('invalid_credentials', 401));
  view();
  passwordValues();
  changePassword();
  expect(await screen.findByText(/Your current password is incorrect/)).toBeInTheDocument();
  expect(controls.replace).not.toHaveBeenCalled();
  expect(controls.signOut).not.toHaveBeenCalled();
  expect(screen.getByLabelText(/^Current password/)).toHaveValue('original password');
});

it('validates current password and confirmation without sending a mutation', () => {
  view();
  passwordValues('', 'short', 'mismatch');
  changePassword();
  expect(screen.getByText('Enter your current password.')).toBeInTheDocument();
  expect(screen.getByText('Use at least 15 Unicode characters.')).toBeInTheDocument();
  expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
  expect(screen.getByLabelText(/^Current password/)).toHaveFocus();
  passwordValues('x'.repeat(129));
  changePassword();
  expect(
    screen.getByText(
      'Use no more than 128 Unicode characters or 512 bytes for your current password.',
    ),
  ).toBeInTheDocument();
  expect(controls.request).not.toHaveBeenCalled();
});

it('changes the password once and keeps submission locked until full navigation', async () => {
  controls.request.mockResolvedValue({ ok: true, status: 204, data: undefined, requestId: '' });
  view();
  passwordValues('  original password  ');
  changePassword();
  await waitFor(() => expect(controls.replace).toHaveBeenCalledOnce());
  changePassword();
  expect(controls.request).toHaveBeenCalledOnce();
  expect(controls.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'identity.changePassword',
    body: { currentPassword: '  original password  ', newPassword: '  a long new password  ' },
  });
  expect(screen.getByRole('button', { name: 'Changing password…' })).toBeDisabled();
});

it('requires explicit session logout for unknown password outcomes and does not replay them', async () => {
  controls.request.mockResolvedValue(failure('invalid_response', 502, { uncertain: true }));
  controls.signOut.mockResolvedValue();
  view();
  passwordValues();
  changePassword();
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out and verify password' }));
  expect(controls.signOut).toHaveBeenCalledOnce();
  changePassword();
  expect(controls.request).toHaveBeenCalledOnce();
});

it('cancels password changes honestly and ignores late success', async () => {
  let done: ((result: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        done = resolve;
      }),
  );
  view();
  passwordValues();
  changePassword();
  changePassword();
  expect(controls.request).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
  await act(async () => {
    done?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(controls.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(controls.replace).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Sign out and verify password' })).toBeInTheDocument();
});

it('renders the account forms in Chinese with the current server identity', () => {
  view(principal, 'zh');
  expect(screen.getByRole('heading', { name: '账户设置' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: '个人资料' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: '修改密码' })).toBeInTheDocument();
});

it('checks the server session before constructing the account route', async () => {
  controls.session.mockResolvedValue(principal);
  const page = await AccountRoute();
  render(<ShellProvider initial={parsePreferences({ locale: 'en' })}>{page}</ShellProvider>);
  expect(screen.getByText('owner@example.test')).toBeInTheDocument();
  expect(controls.session).toHaveBeenCalledOnce();
});

it('does not render account route output after a rejected server session', async () => {
  controls.session.mockRejectedValue(new Error('Redirect to /login'));
  await expect(AccountRoute()).rejects.toThrow('Redirect to /login');
});
