import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { collection, record, descriptor, pageApi, resetPageApi } from './page-fixture';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { BulkDocuments } from '../bulk-documents';
import { CopyDocumentDialog } from '../copy-document-dialog';
import { contentMessages } from '../messages';

beforeEach(resetPageApi);
function bulk(flags: Partial<typeof collection>, trashed = false) {
  renderManagement(
    <BulkDocuments
      collection={{ ...collection, ...flags }}
      documents={[record()]}
      locale="en"
      trashed={trashed}
      t={contentMessages.en}
      onClose={vi.fn<() => void>()}
      onCompleted={vi.fn<() => void>()}
    />,
  );
}
it('excludes disabled bulk actions while retaining independently enabled actions', () => {
  bulk({ disableBulkDelete: true, disableDuplicate: true });
  const select = screen.getByRole('combobox', { name: 'Bulk actions' });
  expect(select).toHaveValue('update');
  expect(screen.queryByRole('option', { name: /Archive/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Copy/ })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Bulk update' })).toBeInTheDocument();
});
it('does not submit a disabled bulk operation even when every operation permission is granted', () => {
  bulk({ disableBulkEdit: true, disableBulkDelete: true, disableDuplicate: true });
  expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'content.batch')).toBe(
    false,
  );
});
it('disables bulk restoration when bulk editing is disabled', () => {
  bulk({ disableBulkEdit: true }, true);
  expect(screen.queryByRole('option')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
});
it('keeps disabled duplication from loading writable copy editors', () => {
  const configured = { ...collection, disableDuplicate: true };
  renderManagement(
    <CopyDocumentDialog
      snapshot={{ collection: configured, editor: descriptor(), document: record() }}
      collections={[configured]}
      busy={false}
      failure={null}
      onClose={vi.fn<() => void>()}
      onCopy={vi.fn<() => Promise<boolean>>()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Copy document' })).toBeDisabled();
  expect(pageApi.request).not.toHaveBeenCalled();
});
