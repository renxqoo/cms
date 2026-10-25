import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { DocumentActions } from '../document-actions';
import type { DocumentActionsProps } from '../document-actions';

afterEach(cleanup);

const labels = {
  save: 'Save',
  saveDraft: 'Save draft',
  publish: 'Publish',
  unpublish: 'Unpublish',
  delete: 'Delete',
  preview: 'Preview',
  cancel: 'Cancel',
  confirm: 'Confirm',
  close: 'Close',
  error: 'The action failed',
  confirmationTitle: 'Confirm document action',
  confirmationDescription: 'Apply the selected action?',
};

const permissions = { create: true, update: true, publish: true, delete: true };

it('hides publication actions when drafts are disabled and keeps an unchanged document unsavable', () => {
  render(
    <DocumentActions
      mode="update"
      draftsEnabled={false}
      status="published"
      dirty={false}
      busy={false}
      uploadPending={false}
      permissions={permissions}
      labels={labels}
      onAction={vi.fn<DocumentActionsProps['onAction']>(() =>
        Promise.resolve({ status: 'success' }),
      )}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Unpublish' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
});

it('uses create permission for a new document and hides destructive actions', () => {
  render(
    <DocumentActions
      mode="create"
      draftsEnabled
      status="draft"
      dirty
      busy={false}
      uploadPending={false}
      permissions={{ ...permissions, create: false }}
      labels={labels}
      onAction={vi.fn<DocumentActionsProps['onAction']>(() =>
        Promise.resolve({ status: 'success' }),
      )}
    />,
  );
  expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
});

it('a failed document action stays visible instead of reporting success', async () => {
  const onAction = vi
    .fn<DocumentActionsProps['onAction']>()
    .mockResolvedValue({ status: 'error', message: 'Version conflict' });
  render(
    <DocumentActions
      mode="update"
      draftsEnabled={false}
      status="draft"
      dirty
      busy={false}
      uploadPending={false}
      permissions={permissions}
      labels={labels}
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Version conflict'));
  expect(onAction).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
});

it('regression: a confirmation from a revoked permission cannot remain active or revive later', async () => {
  const onAction = vi.fn<DocumentActionsProps['onAction']>(() =>
    Promise.resolve({ status: 'success' }),
  );
  const props: DocumentActionsProps = {
    mode: 'update',
    draftsEnabled: true,
    status: 'published',
    dirty: true,
    busy: false,
    uploadPending: false,
    permissions,
    labels,
    onAction,
  };
  const { rerender } = render(<DocumentActions {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  rerender(<DocumentActions {...props} permissions={{ ...permissions, delete: false }} />);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  rerender(<DocumentActions {...props} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onAction).not.toHaveBeenCalled();
});
