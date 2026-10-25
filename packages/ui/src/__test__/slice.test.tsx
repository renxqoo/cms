import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { Button } from '../actions.tsx';
import { DataTable, Pagination } from '../data.tsx';
import { Field, Input, SearchBar } from '../forms.tsx';
import { FormDialog } from '../overlays.tsx';
import type { AsyncResult } from '../overlays.tsx';

function FormExample({
  submit,
}: {
  submit: (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <FormDialog
      open={open}
      onOpenChange={setOpen}
      title="New administrator"
      closeLabel="Close"
      cancelLabel="Cancel"
      submitLabel="Create"
      errorLabel="Request failed"
      trigger={<Button>Open form</Button>}
      onSubmit={submit}
    >
      <Field id="email" label="Email" description="Your work email" required>
        <Input type="email" />
      </Field>
    </FormDialog>
  );
}

function SearchExample({
  search,
  mode = { type: 'submit' },
}: {
  search: (value: string) => void;
  mode?: { type: 'submit' } | { type: 'debounced'; delayMs: number };
}) {
  const [value, setValue] = useState('');
  return (
    <SearchBar
      value={value}
      onValueChange={setValue}
      onSearch={search}
      mode={mode}
      label="Search documents"
      searchLabel="Search"
      clearLabel="Clear search"
      placeholder="Title"
    />
  );
}

it('associates fields with labels, descriptions and invalid feedback', () => {
  render(
    <Field id="name" label="Name" error="Name is required" description="Public name" required>
      <Input />
    </Field>,
  );
  const input = screen.getByRole('textbox', { name: 'Name' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(input).toHaveAccessibleDescription('Public name Name is required');
  expect(input).toBeRequired();
});

it('prevents disabled and busy buttons from dispatching actions', async () => {
  const click = vi.fn<() => void>();
  const user = userEvent.setup();
  render(
    <>
      <Button disabled onClick={click}>
        Disabled
      </Button>
      <Button busy onClick={click}>
        Pending
      </Button>
      <Button variant="outline" size="sm" onClick={click}>
        Enabled
      </Button>
    </>,
  );
  await user.click(screen.getByRole('button', { name: 'Disabled' }));
  await user.click(screen.getByRole('button', { name: 'Pending' }));
  expect(click).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Enabled' }));
  expect(click).toHaveBeenCalledTimes(1);
});

it('submits the native form once, preserves failed input and closes only after success', async () => {
  let finish: ((result: AsyncResult) => void) | undefined;
  const submit = vi.fn<
    (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>
  >(
    (_input: { signal: AbortSignal; formData: FormData }) =>
      new Promise<AsyncResult>((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<FormExample submit={submit} />);
  await user.click(screen.getByRole('button', { name: 'Open form' }));
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dev@example.com');
  const create = screen.getByRole('button', { name: 'Create' });
  await user.dblClick(create);
  expect(submit).toHaveBeenCalledTimes(1);
  expect(submit.mock.calls[0]?.[0].formData.get('email')).toBe('dev@example.com');
  finish?.({
    status: 'error',
    message: 'Please check the email',
    fieldErrors: { email: 'Email already exists' },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent('Please check the email');
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('dev@example.com');
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
  await user.click(create);
  finish?.({ status: 'success' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('renders a visible fallback for thrown submit failures', async () => {
  const user = userEvent.setup();
  render(<FormExample submit={() => Promise.reject(new Error('Internal secret'))} />);
  await user.click(screen.getByRole('button', { name: 'Open form' }));
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dev@example.com');
  await user.click(screen.getByRole('button', { name: 'Create' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Request failed');
  expect(screen.queryByText('Internal secret')).not.toBeInTheDocument();
});

it('aborts when closed and ignores the old result after reopening', async () => {
  let finish: ((result: AsyncResult) => void) | undefined;
  let signal: AbortSignal | undefined;
  const user = userEvent.setup();
  render(
    <FormExample
      submit={({ signal: requestSignal }) => {
        signal = requestSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Open form' }));
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dev@example.com');
  await user.click(screen.getByRole('button', { name: 'Create' }));
  await user.keyboard('{Escape}');
  expect(signal?.aborted).toBe(true);
  await user.click(screen.getByRole('button', { name: 'Open form' }));
  finish?.({ status: 'success' });
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Open form' })).toHaveFocus());
});

it('aborts an unfinished form operation on unmount', async () => {
  let signal: AbortSignal | undefined;
  const user = userEvent.setup();
  const view = render(
    <FormExample
      submit={({ signal: requestSignal }) => {
        signal = requestSignal;
        return new Promise((resolve) => {
          requestSignal.addEventListener(
            'abort',
            () => resolve({ status: 'error', message: 'Aborted' }),
            { once: true },
          );
        });
      }}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Open form' }));
  await user.type(screen.getByRole('textbox', { name: 'Email' }), 'dev@example.com');
  await user.click(screen.getByRole('button', { name: 'Create' }));
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('submits search explicitly and reports clear once', async () => {
  const search = vi.fn<(value: string) => void>();
  const user = userEvent.setup();
  render(<SearchExample search={search} />);
  await user.type(screen.getByRole('searchbox'), 'draft');
  expect(search).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Search' }));
  expect(search).toHaveBeenLastCalledWith('draft');
  await user.click(screen.getByRole('button', { name: 'Clear search' }));
  expect(search.mock.calls).toEqual([['draft'], ['']]);
});

it('does not search during IME composition and cancels pending search on unmount', async () => {
  const search = vi.fn<(value: string) => void>();
  const view = render(<SearchExample search={search} mode={{ type: 'debounced', delayMs: 10 }} />);
  const input = screen.getByRole('searchbox');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '草稿' } });
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
  expect(search).not.toHaveBeenCalled();
  fireEvent.compositionEnd(input, { data: '草稿' });
  await waitFor(() => expect(search).toHaveBeenCalledWith('草稿'));
  fireEvent.change(input, { target: { value: 'new' } });
  view.unmount();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 20);
  });
  expect(search.mock.calls).toEqual([['草稿']]);
});

it('requests sorting and excludes locked rows from select-all', async () => {
  const sort = vi.fn<(value: { key: string; direction: 'asc' | 'desc' } | null) => void>();
  const select = vi.fn<(ids: string[]) => void>();
  const rows = [
    { id: 'a', name: 'Alpha', locked: false },
    { id: 'b', name: 'Beta', locked: true },
  ];
  const user = userEvent.setup();
  render(
    <DataTable
      rows={rows}
      columns={[{ key: 'name', header: 'Name', sortable: true, cell: (row) => row.name }]}
      rowKey={(row) => row.id}
      sort={null}
      onSortChange={sort}
      selectedIds={[]}
      onSelectionChange={select}
      isRowSelectable={(row) => !row.locked}
      selectionLabel="Select current page"
      rowSelectionLabel={(row) => `Select ${row.name}`}
      emptyLabel="No results"
      loadingLabel="Loading"
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Name' }));
  expect(sort).toHaveBeenCalledWith({ key: 'name', direction: 'asc' });
  await user.click(screen.getByRole('checkbox', { name: 'Select current page' }));
  expect(select).toHaveBeenCalledWith(['a']);
  expect(screen.getByRole('checkbox', { name: 'Select Beta' })).toBeDisabled();
});

it('offers retry for errors and distinguishes loading from empty results', async () => {
  const retry = vi.fn<() => void>();
  const props = {
    rows: [] as { id: string }[],
    columns: [{ key: 'id', header: 'ID', cell: (row: { id: string }) => row.id }],
    rowKey: (row: { id: string }) => row.id,
    emptyLabel: 'No results',
    loadingLabel: 'Loading',
  };
  const view = render(
    <DataTable {...props} error="Unavailable" retryLabel="Try again" onRetry={retry} />,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledTimes(1);
  view.rerender(<DataTable {...props} loading />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  expect(screen.queryByText('No results')).not.toBeInTheDocument();
  view.rerender(<DataTable {...props} />);
  expect(screen.getByText('No results')).toBeInTheDocument();
});

it('prevents pagination beyond boundaries and resets page on page-size change', async () => {
  const page = vi.fn<(value: number) => void>();
  const pageSize = vi.fn<(change: { pageSize: number; page: number }) => void>();
  const user = userEvent.setup();
  const props = {
    page: 1,
    pageSize: 10,
    total: 25,
    onPageChange: page,
    previousLabel: 'Previous',
    nextLabel: 'Next',
    pageLabel: 'Page 1 of 3',
    totalLabel: '25 items',
  };
  const view = render(<Pagination {...props} />);
  expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(page).toHaveBeenLastCalledWith(2);
  view.rerender(
    <Pagination
      {...props}
      page={3}
      onPageSizeChange={pageSize}
      pageSizeOptions={[10, 25]}
      pageSizeLabel="Items per page"
    />,
  );
  await user.selectOptions(screen.getByRole('combobox', { name: 'Items per page' }), '25');
  expect(pageSize).toHaveBeenCalledWith({ pageSize: 25, page: 1 });
  expect(page.mock.calls).toEqual([[2]]);
  view.rerender(<Pagination {...props} total={0} />);
  expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
});
