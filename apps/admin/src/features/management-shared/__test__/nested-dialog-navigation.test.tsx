import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ManagementTestProvider } from '../../../../../../test/support/admin-management';
import { UnsavedChangesGuard } from '../../../components/cms/unsaved-changes';
import { useAppNavigation } from '../../../components/shell/navigation/provider';
import { ManagementDialog } from '../management-dialog';

const router = vi.hoisted(() => ({
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/collections/articles',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => router,
}));

function Workspace() {
  const { adapter, push } = useAppNavigation();
  return (
    <UnsavedChangesGuard
      dirty={false}
      navigation={adapter}
      labels={{
        title: 'Leave all drafts?',
        description: 'Your edits will be lost.',
        confirm: 'Leave',
        cancel: 'Keep editing',
        close: 'Close',
      }}
    >
      <ManagementDialog open title="Edit folder" onClose={() => {}} onSubmit={() => {}}>
        <label>
          Folder name
          <input defaultValue="Existing folder" />
        </label>
        <button type="button" onClick={() => push('/dashboard/account')}>
          Open account
        </button>
      </ManagementDialog>
    </UnsavedChangesGuard>
  );
}

it('keeps a real nested modal draft and restores focus when page navigation is cancelled', async () => {
  const user = userEvent.setup();
  const { unmount } = render(
    <ManagementTestProvider>
      <Workspace />
    </ManagementTestProvider>,
  );
  const input = screen.getByLabelText('Folder name');
  await user.clear(input);
  await user.type(input, 'Retain this folder');
  const link = screen.getByRole('button', { name: 'Open account' });
  await user.click(link);
  expect(screen.getByRole('dialog', { name: 'Leave all drafts?' })).toBeVisible();
  expect(router.push).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Leave all drafts?' })).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(link).toHaveFocus());
  expect(input).toHaveValue('Retain this folder');
  expect(screen.getByRole('dialog', { name: 'Edit folder' })).toBeVisible();
  await user.click(link);
  await user.click(screen.getByRole('button', { name: /^Leave$/ }));
  expect(router.push).toHaveBeenCalledOnce();
  expect(router.push.mock.calls[0]?.[0]).toBe('/dashboard/account');
  unmount();
});
