import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { Button } from '../actions.tsx';
import { DataTable, Pagination } from '../data.tsx';
import type { DataTableSort } from '../data.tsx';
import { Banner, Pill, Skeleton } from '../feedback.tsx';
import { Field, Input, NativeSelect, SearchBar, Textarea } from '../forms.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Gutter,
  ListContent,
  ListFooter,
  ListPanel,
  ListToolbar,
  PageHeader,
} from '../layout.tsx';
import { Breadcrumbs, Hamburger } from '../navigation.tsx';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  FormDialog,
} from '../overlays.tsx';
import type { AsyncResult } from '../overlays.tsx';

it('keeps native textarea and select labels, values, disabled and readonly semantics', async () => {
  const user = userEvent.setup();
  render(
    <>
      <Field id="details" label="Details">
        <Textarea defaultValue="Read me" readOnly />
      </Field>
      <Field id="state" label="State">
        <NativeSelect defaultValue="draft">
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </NativeSelect>
      </Field>
      <Input aria-label="Disabled field" disabled />
    </>,
  );
  expect(screen.getByRole('textbox', { name: 'Details' })).toHaveAttribute('readonly');
  expect(screen.getByRole('textbox', { name: 'Details' })).not.toHaveAttribute('aria-invalid');
  await user.selectOptions(screen.getByRole('combobox', { name: 'State' }), 'published');
  expect(screen.getByRole('combobox', { name: 'State' })).toHaveValue('published');
  expect(screen.getByRole('textbox', { name: 'Disabled field' })).toBeDisabled();
});

it('composes a semantic page header, content card and list toolbar with actions', async () => {
  const save = vi.fn<() => void>();
  const view = render(
    <Gutter>
      <PageHeader
        title="Documents"
        description="Manage your content"
        icon={<span aria-hidden="true">D</span>}
        actions={<Button onClick={save}>New document</Button>}
      />
      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Changes made today</CardDescription>
        </CardHeader>
        <CardContent>
          <ListPanel aria-label="Latest documents">
            <ListToolbar>
              <Input aria-label="Search latest" />
            </ListToolbar>
            <ListContent>Drafts</ListContent>
            <ListFooter>2 documents</ListFooter>
          </ListPanel>
        </CardContent>
        <CardFooter>Updated now</CardFooter>
      </Card>
    </Gutter>,
  );
  expect(screen.getByRole('heading', { level: 1, name: 'Documents' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 2, name: 'Recent activity' })).toBeVisible();
  expect(screen.getByRole('region', { name: 'Latest documents' })).toContainElement(
    screen.getByRole('textbox', { name: 'Search latest' }),
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'New document' }));
  expect(save).toHaveBeenCalledOnce();
  view.rerender(<PageHeader title="Empty workspace" />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByText('Manage your content')).not.toBeInTheDocument();
});

it('announces status and error banners while pills remain readable metadata', () => {
  const view = render(
    <>
      <Banner>Processing changes</Banner>
      <Pill>Draft</Pill>
      <Skeleton data-testid="placeholder" className="h-8" />
    </>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Processing changes');
  expect(screen.getByText('Draft')).toBeVisible();
  expect(screen.getByTestId('placeholder')).toHaveAttribute('aria-hidden', 'true');
  view.rerender(
    <>
      <Banner tone="error">Changes failed</Banner>
      <Pill tone="error" dot={false}>
        Rejected
      </Pill>
    </>,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Changes failed');
  for (const tone of ['info', 'success', 'warning'] as const) {
    view.rerender(
      <>
        <Banner tone={tone}>Status: {tone}</Banner>
        <Pill tone={tone}>{tone}</Pill>
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(`Status: ${tone}`);
  }
});

it('exposes current breadcrumbs and toggles the navigation expansion state', async () => {
  const toggle = vi.fn<() => void>();
  const view = render(
    <>
      <Breadcrumbs
        label="Breadcrumb"
        items={[
          { id: 'home', label: 'Home', href: '/ui' },
          { id: 'lists', label: 'Lists' },
        ]}
      />
      <Hamburger expanded={false} onToggle={toggle} label="Toggle navigation" />
    </>,
  );
  expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/ui');
  expect(screen.getByText('Lists')).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('link', { name: 'Lists' })).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Toggle navigation' }));
  expect(toggle).toHaveBeenCalledOnce();
  view.rerender(<Hamburger expanded onToggle={toggle} label="Toggle navigation" />);
  expect(screen.getByRole('button', { name: 'Toggle navigation' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

it('composes dialog primitives with explicit dismissal and description', async () => {
  const user = userEvent.setup();
  render(
    <Dialog>
      <DialogTrigger render={<Button>Open details</Button>} />
      <DialogContent closeLabel="Close details" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Document details</DialogTitle>
          <DialogDescription>Read the document metadata</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button>Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>,
  );
  await user.click(screen.getByRole('button', { name: 'Open details' }));
  expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Read the document metadata');
  expect(screen.queryByRole('button', { name: 'Close details' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

function actionCell(row: { name: string }) {
  return <Button aria-label={`Edit ${row.name}`}>Edit</Button>;
}

function SortableExample() {
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <DataTable
      rows={[
        { id: 'a', name: 'Alpha' },
        { id: 'b', name: 'Beta' },
      ]}
      columns={[
        { key: 'name', header: 'Name', sortable: true, cell: (row) => row.name },
        { key: 'id', header: 'ID', sortable: true, align: 'right', cell: (row) => row.id },
        {
          key: 'actions',
          header: 'Actions',
          align: 'center',
          cell: actionCell,
        },
      ]}
      rowKey={(row) => row.id}
      sort={sort}
      onSortChange={setSort}
      selectedIds={selected}
      onSelectionChange={setSelected}
      selectionLabel="Select page"
      rowSelectionLabel={(row) => `Select ${row.name}`}
      emptyLabel="Empty"
      loadingLabel="Loading"
    />
  );
}

it('cycles sorting and provides independent row selection with indeterminate select-all', async () => {
  const user = userEvent.setup();
  render(<SortableExample />);
  const name = screen.getByRole('button', { name: 'Name' });
  await user.click(name);
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await user.click(name);
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
    'aria-sort',
    'descending',
  );
  await user.click(name);
  expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'none');
  await user.click(screen.getByRole('button', { name: 'ID' }));
  expect(screen.getByRole('columnheader', { name: 'ID' })).toHaveAttribute(
    'aria-sort',
    'ascending',
  );
  await user.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
  expect(screen.getByRole('checkbox', { name: 'Select page' })).toBePartiallyChecked();
  await user.click(screen.getByRole('checkbox', { name: 'Select Beta' }));
  expect(screen.getByRole('checkbox', { name: 'Select page' })).toBeChecked();
  await user.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
  expect(screen.getByRole('checkbox', { name: 'Select Beta' })).toBeChecked();
  await user.click(screen.getByRole('checkbox', { name: 'Select page' }));
  await user.click(screen.getByRole('checkbox', { name: 'Select page' }));
  expect(screen.getByRole('checkbox', { name: 'Select Beta' })).not.toBeChecked();
});

it('keeps plain table cells available without sorting or selection controls', () => {
  const props = {
    rows: [{ id: 'a' }],
    columns: [{ key: 'id', header: 'ID', cell: (row: { id: string }) => row.id }],
    rowKey: (row: { id: string }) => row.id,
    emptyLabel: 'Empty',
    loadingLabel: 'Loading',
  };
  const view = render(<DataTable {...props} />);
  expect(screen.getByRole('cell', { name: 'a' })).toBeVisible();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  view.rerender(<DataTable {...props} error="Unavailable" />);
  expect(screen.getByRole('alert')).toHaveTextContent('Unavailable');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('cancels an obsolete debounced search when the URL supplies another value', async () => {
  const search = vi.fn<(value: string) => void>();
  const change = vi.fn<(value: string) => void>();
  const props = {
    onSearch: search,
    onValueChange: change,
    mode: { type: 'debounced', delayMs: 20 } as const,
    label: 'Search documents',
    searchLabel: 'Search',
    clearLabel: 'Clear',
    placeholder: 'Title',
  };
  const view = render(<SearchBar {...props} value="initial" />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'old draft' } });
  view.rerender(<SearchBar {...props} value="history value" />);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 30);
  });
  expect(search).not.toHaveBeenCalled();
  expect(screen.getByRole('searchbox')).toHaveValue('history value');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Search' }));
  expect(search).not.toHaveBeenCalled();
});

it('focuses a failed field from the summary and ignores programmatic duplicate submits', async () => {
  let finish: ((result: AsyncResult) => void) | undefined;
  const submit = vi.fn<
    (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>
  >(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(
    <FormDialog
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      title="Edit document"
      description="Update title"
      closeLabel="Close"
      cancelLabel="Cancel"
      submitLabel="Save"
      errorLabel="Failed"
      onSubmit={submit}
    >
      <Field id="title" label="Title">
        <Input />
      </Field>
    </FormDialog>,
  );
  const form = screen.getByRole('textbox', { name: 'Title' }).closest('form');
  if (!form) throw new Error('Expected native form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(submit).toHaveBeenCalledOnce();
  finish?.({
    status: 'error',
    message: 'Invalid document',
    fieldErrors: { title: 'Title is too short' },
  });
  const summary = await screen.findByRole('alert');
  await waitFor(() => expect(summary).toHaveFocus());
  await userEvent.setup().click(screen.getByRole('button', { name: 'Title is too short' }));
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveFocus();
});

it('does not invoke disabled submission even when a native form event is dispatched', () => {
  const submit = vi.fn<
    (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>
  >(() => Promise.resolve({ status: 'success' }));
  render(
    <FormDialog
      open
      onOpenChange={vi.fn<(open: boolean) => void>()}
      title="Edit document"
      closeLabel="Close"
      cancelLabel="Cancel"
      submitLabel="Save"
      errorLabel="Failed"
      submitDisabled
      onSubmit={submit}
    >
      <Field id="title" label="Title">
        <Input />
      </Field>
    </FormDialog>,
  );
  const form = screen.getByRole('textbox', { name: 'Title' }).closest('form');
  if (!form) throw new Error('Expected native form');
  fireEvent.submit(form);
  expect(submit).not.toHaveBeenCalled();
});

it('moves to the previous page without changing the current page size', async () => {
  const page = vi.fn<(value: number) => void>();
  render(
    <Pagination
      page={2}
      pageSize={10}
      total={25}
      onPageChange={page}
      previousLabel="Previous"
      nextLabel="Next"
      pageLabel="Page 2 of 3"
      totalLabel=""
    />,
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Previous' }));
  expect(page).toHaveBeenCalledWith(1);
});

it('does not dispatch an already scheduled search after the control becomes disabled', async () => {
  const search = vi.fn<(value: string) => void>();
  const props = {
    onSearch: search,
    onValueChange: vi.fn<(value: string) => void>(),
    mode: { type: 'debounced', delayMs: 20 } as const,
    label: 'Search documents',
    searchLabel: 'Search',
    clearLabel: 'Clear',
    placeholder: 'Title',
  };
  const view = render(<SearchBar {...props} value="" />);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'draft' } });
  view.rerender(<SearchBar {...props} value="draft" disabled />);
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 30);
  });
  expect(search).not.toHaveBeenCalled();
});

it('does not dispatch a separate page navigation when page size changes', async () => {
  const changePage = vi.fn<(page: number) => void>();
  const changeSize = vi.fn<(change: { pageSize: number; page: number }) => void>();
  render(
    <Pagination
      page={3}
      pageSize={10}
      total={25}
      onPageChange={changePage}
      onPageSizeChange={changeSize}
      pageSizeOptions={[10, 25]}
      pageSizeLabel="Items per page"
      previousLabel="Previous"
      nextLabel="Next"
      pageLabel="Page 3 of 3"
      totalLabel="25 items"
    />,
  );
  await userEvent
    .setup()
    .selectOptions(screen.getByRole('combobox', { name: 'Items per page' }), '25');
  expect(changePage).not.toHaveBeenCalled();
  expect(changeSize).toHaveBeenCalledExactlyOnceWith({ pageSize: 25, page: 1 });
});

it('does not reopen an externally controlled form with the previous session errors', async () => {
  const submit = vi.fn<
    (input: { signal: AbortSignal; formData: FormData }) => Promise<AsyncResult>
  >(() =>
    Promise.resolve({
      status: 'error',
      message: 'Old failure',
      fieldErrors: { title: 'Old name error' },
    }),
  );
  const props = {
    onOpenChange: vi.fn<(open: boolean) => void>(),
    title: 'Edit document',
    closeLabel: 'Close',
    cancelLabel: 'Cancel',
    submitLabel: 'Save',
    errorLabel: 'Failed',
    onSubmit: submit,
    children: (
      <Field id="title" label="Title">
        <Input />
      </Field>
    ),
  };
  const view = render(<FormDialog {...props} open />);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Old failure');
  expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
  view.rerender(<FormDialog {...props} open={false} />);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.rerender(<FormDialog {...props} open />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText('Old name error')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Title' })).not.toHaveAttribute('aria-invalid');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

it('does not select hidden previous rows while a table error is displayed', async () => {
  const select = vi.fn<(ids: string[]) => void>();
  render(
    <DataTable
      rows={[{ id: 'old-a', name: 'Previous document' }]}
      columns={[{ key: 'name', header: 'Name', cell: (row) => row.name }]}
      rowKey={(row) => row.id}
      error="List request failed"
      selectedIds={[]}
      onSelectionChange={select}
      selectionLabel="Select page"
      rowSelectionLabel={(row) => `Select ${row.name}`}
      emptyLabel="Empty"
      loadingLabel="Loading"
    />,
  );
  expect(screen.queryByText('Previous document')).not.toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Select page' })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Select page' }));
  expect(select).not.toHaveBeenCalled();
});
