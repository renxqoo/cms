import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import type { Me } from '../../../contracts/auth';
import { AccountPage } from '../../account/account-page';
import { AdminShell } from '../admin-shell';

const controls = vi.hoisted(() => ({
  request: vi.fn<(operation: string) => void>(),
  replace: vi.fn<() => void>(),
}));
vi.mock('../../../api/client', () => ({
  requestApi: (input: { operation: string }) => {
    controls.request(input.operation);
    if (input.operation === 'access.myOperations')
      return Promise.resolve({
        ok: true,
        status: 200,
        requestId: '',
        data: { rows: [], total: 0, page: 1, pageSize: 100 },
      });
    if (input.operation === 'access.myNavigation')
      return Promise.resolve({ ok: true, status: 200, requestId: '', data: { rows: [] } });
    return Promise.resolve({ ok: true, status: 204, requestId: '', data: undefined });
  },
}));
vi.mock('../session-navigation', () => ({ replaceAfterSignOut: controls.replace }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/account',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn<(path: string) => void>(),
    replace: vi.fn<(path: string) => void>(),
    refresh: vi.fn<() => void>(),
  }),
}));

const principal: Me = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  displayName: 'Account owner',
  version: 1,
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

afterEach(() => vi.resetAllMocks());

it('regression: confirmed password change clears a dirty profile leave guard before replacing the authenticated document', async () => {
  const unloadAtNavigation: boolean[] = [];
  controls.replace.mockImplementation(() => {
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    unloadAtNavigation.push(unload.defaultPrevented);
  });
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <AdminShell principal={principal}>
        <AccountPage principal={principal} />
      </AdminShell>
    </ShellProvider>,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), {
    target: { value: 'Unsaved profile draft' },
  });
  const before = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(before);
  expect(before.defaultPrevented).toBe(true);
  fireEvent.change(screen.getByLabelText(/^Current password/), {
    target: { value: 'original password' },
  });
  fireEvent.change(screen.getByLabelText(/^New password/), {
    target: { value: 'a changed password' },
  });
  fireEvent.change(screen.getByLabelText(/^Confirm new password/), {
    target: { value: 'a changed password' },
  });
  fireEvent.submit(screen.getByRole('form', { name: 'Change password' }));
  await waitFor(() => expect(controls.replace).toHaveBeenCalledOnce());
  expect(unloadAtNavigation).toEqual([false]);
  expect(screen.queryByRole('form', { name: 'Profile' })).not.toBeInTheDocument();
  expect(
    controls.request.mock.calls.filter(([operation]) => operation === 'identity.changePassword'),
  ).toHaveLength(1);
  expect(
    controls.request.mock.calls.filter(([operation]) => operation === 'identity.logout'),
  ).toHaveLength(0);
});
