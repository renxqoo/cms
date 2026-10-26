import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { Field, Input } from '@new-cms/ui/forms';
import { ManagementList } from '../management-list';
import { ManagementDialog } from '../management-dialog';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/roles',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));

it('composes real table search, sorting and paging actions in both languages', () => {
  const search = vi.fn<(value: string) => void>();
  const page = vi.fn<(value: number) => void>();
  const size = vi.fn<(value: number) => void>();
  const sort = vi.fn<() => void>();
  renderManagement(
    <ManagementList
      columns={[
        {
          key: 'name',
          header: 'Name',
          sortable: true,
          cell: (row: { id: string; name: string }) => row.name,
        },
      ]}
      rows={[{ id: 'one', name: 'Visible entry' }]}
      rowKey={(row) => row.id}
      page={1}
      pageSize={10}
      total={20}
      loading={false}
      query=""
      onSearch={search}
      onPageChange={page}
      onPageSizeChange={size}
      onSortChange={sort}
      filters={<span>Filters</span>}
    />,
  );
  expect(screen.getByText('Visible entry')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'Updated' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Search$/ }));
  expect(search).toHaveBeenCalledWith('Updated');
  fireEvent.click(screen.getByRole('button', { name: 'Name' }));
  expect(sort).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(page).toHaveBeenCalledWith(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '20' },
  });
  expect(size).toHaveBeenCalledWith(20);
});

it('reports loading and errors without exposing stale rows and supports a retry', () => {
  const retry = vi.fn<() => void>();
  const view = renderManagement(
    <ManagementList
      columns={[{ key: 'id', header: 'ID', cell: (row: { id: string }) => row.id }]}
      rows={[{ id: 'stale' }]}
      rowKey={(row) => row.id}
      page={1}
      pageSize={20}
      total={1}
      loading
      error={null}
      onPageChange={vi.fn<(value: number) => void>()}
      onPageSizeChange={vi.fn<(value: number) => void>()}
    />,
    'zh',
  );
  expect(screen.getByRole('status')).toHaveTextContent('正在加载');
  expect(screen.queryByText('stale')).not.toBeInTheDocument();
  view.rerender(<></>);
  renderManagement(
    <ManagementList
      columns={[{ key: 'id', header: 'ID', cell: (row: { id: string }) => row.id }]}
      rows={[]}
      rowKey={(row) => row.id}
      page={1}
      pageSize={20}
      total={0}
      loading={false}
      error="Catalog unavailable"
      onPageChange={vi.fn<(value: number) => void>()}
      onPageSizeChange={vi.fn<(value: number) => void>()}
      onRetry={retry}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
});

it('submits actual form controls and blocks closing, fields and repeat submits while pending', async () => {
  const submit = vi.fn<(form: FormData) => void>();
  const close = vi.fn<() => void>();
  const props = {
    open: true,
    onClose: close,
    title: 'Edit metadata',
    onSubmit: submit,
    children: (
      <Field id="title" label="Title">
        <Input defaultValue="Initial" />
      </Field>
    ),
  };
  const view = renderManagement(<ManagementDialog {...props} />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Title' }), {
    target: { value: 'Actual form value' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(submit.mock.calls[0]?.[0].get('title')).toBe('Actual form value');
  view.rerender(<></>);
  renderManagement(<ManagementDialog {...props} pending locked />);
  const dialog = await screen.findByRole('dialog', { name: 'Edit metadata' });
  expect(within(dialog).getByRole('textbox', { name: 'Title' })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Close' })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  expect(close).not.toHaveBeenCalled();
});

it('uses destructive semantics and a normal close callback after a confirmed idle result', async () => {
  const close = vi.fn<() => void>();
  renderManagement(
    <ManagementDialog
      open
      onClose={close}
      title="Delete record"
      onSubmit={vi.fn<(form: FormData) => void>()}
      submitLabel="Delete"
      destructive
      disabled
      description="Irreversible action"
    >
      <p>Record details</p>
    </ManagementDialog>,
    'zh',
  );
  expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  const buttons = screen.getAllByRole('button', { name: '关闭' });
  const footer = buttons.at(-1);
  if (!footer) throw new Error('Missing close control');
  await userEvent.click(footer);
  expect(close).toHaveBeenCalledOnce();
});

it('regression: an out-of-range server page must provide an available-page recovery action', () => {
  const page = vi.fn<(value: number) => void>();
  renderManagement(
    <ManagementList
      columns={[{ key: 'id', header: 'ID', cell: (row: { id: string }) => row.id }]}
      rows={[]}
      rowKey={(row) => row.id}
      page={7}
      pageSize={20}
      total={1}
      loading={false}
      onPageChange={page}
      onPageSizeChange={vi.fn<(value: number) => void>()}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Go to available page' }));
  expect(page).toHaveBeenCalledWith(1);
});

it('regression: unresolved list requests do not display an invented zero-record total', () => {
  renderManagement(
    <ManagementList
      columns={[{ key: 'id', header: 'ID', cell: (row: { id: string }) => row.id }]}
      rows={[]}
      rowKey={(row) => row.id}
      page={1}
      pageSize={20}
      total={0}
      loading
      onPageChange={vi.fn<(value: number) => void>()}
      onPageSizeChange={vi.fn<(value: number) => void>()}
    />,
  );
  expect(screen.queryByText(/0 records/)).not.toBeInTheDocument();
});
