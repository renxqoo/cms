import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { RelationshipInput } from '../relationship-input';
import type { RelationshipOption, RelationshipValue } from '../relationship-input';

afterEach(cleanup);

const collections = [
  { id: 'articles', label: 'Articles' },
  { id: 'media', label: 'Media' },
];

const options: readonly RelationshipOption[] = [
  { collection: 'articles', id: '1', label: 'Welcome' },
  { collection: 'media', id: '1', label: 'Hero' },
  { collection: 'articles', id: '2', label: 'Locked', disabled: true },
];

const labels = {
  search: 'Search documents',
  chooseExisting: 'Choose existing',
  empty: 'No documents found',
  loading: 'Loading documents',
  error: 'Could not load documents',
  retry: 'Retry documents',
  clear: 'Clear selection',
  remove: 'Remove',
  unavailable: 'Unavailable',
  maximum: 'Selection limit reached',
  create: 'Create',
  edit: 'Edit',
  moveUp: 'Move up',
  moveDown: 'Move down',
  close: 'Close',
  collection: 'Collection',
  sorting: {
    listLabel: 'Selected documents',
    roleDescription: 'Sortable item',
    invalidItemsLabel: 'Invalid selected documents',
    handleLabel: (label: string) => `Move ${label}`,
    instructions: 'Press Space and use arrow keys to move.',
    start: (label: string) => `Moving ${label}`,
    move: (label: string, position: number) => `${label} at ${position}`,
    end: (label: string) => `Moved ${label}`,
    cancel: (label: string) => `Canceled ${label}`,
  },
};

function deferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) throw new Error('Promise resolver unavailable');
      resolvePromise(value);
    },
  };
}

it('keeps documents with the same id in different collections independently selected', () => {
  const onChange = vi.fn<(value: readonly RelationshipValue[]) => void>();
  function Harness() {
    const [value, setValue] = useState<readonly RelationshipValue[]>([]);
    return (
      <RelationshipInput
        mode="multiple"
        label="Related documents"
        collections={collections}
        options={options}
        value={value}
        onChange={(next) => {
          setValue(next);
          onChange(next);
        }}
        appearance="select"
        maxRows={3}
        labels={labels}
      />
    );
  }
  render(<Harness />);
  fireEvent.focus(screen.getByLabelText('Search documents'));
  fireEvent.click(screen.getByRole('option', { name: 'Articles: Welcome' }));
  fireEvent.click(screen.getByRole('option', { name: 'Media: Hero' }));
  expect(
    screen.getByRole('button', { name: 'Move Hero' }).getAttribute('aria-roledescription'),
  ).toBe('Sortable item');
  expect(onChange).toHaveBeenLastCalledWith([
    { collection: 'articles', id: '1', label: 'Welcome' },
    { collection: 'media', id: '1', label: 'Hero' },
  ]);
});

it('enforces maxRows without preventing removal and preserves unavailable values', () => {
  const onChange = vi.fn<(value: readonly RelationshipValue[]) => void>();
  render(
    <RelationshipInput
      mode="multiple"
      label="Related documents"
      collections={collections}
      options={options}
      value={[{ collection: 'articles', id: 'missing', label: 'Archived', available: false }]}
      onChange={onChange}
      appearance="select"
      maxRows={1}
      labels={labels}
    />,
  );
  expect(screen.getByText('Archived')).toBeTruthy();
  expect(screen.getByText('Unavailable')).toBeTruthy();
  fireEvent.focus(screen.getByLabelText('Search documents'));
  fireEvent.click(screen.getByRole('option', { name: 'Media: Hero' }));
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Archived' }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith([]);
});

it.each([
  { source: 'synchronous', remote: false },
  { source: 'asynchronous', remote: true },
])(
  'regression: selected relations retain their value but reflect unavailable matching options in $source mode',
  async ({ remote }) => {
    const onChange = vi.fn<(value: RelationshipValue | null) => void>();
    const loadOptions = remote ? () => Promise.resolve(options) : undefined;
    render(
      <RelationshipInput
        mode="single"
        label="Related document"
        collections={collections}
        options={[{ collection: 'articles', id: '1', label: 'Welcome', available: false }]}
        value={{ collection: 'articles', id: '1', label: 'Selected article', available: true }}
        onChange={onChange}
        appearance="select"
        maxRows={1}
        labels={labels}
        {...(loadOptions ? { loadOptions } : {})}
      />,
    );
    await waitFor(() => expect(screen.queryByText('Loading documents')).toBeNull());
    expect(screen.getByText('Selected article')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Selected article' }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
  },
);

it.each([
  { source: 'synchronous', remote: false },
  { source: 'asynchronous', remote: true },
])(
  'regression: withdrawing an allowed collection marks selected relations unavailable in $source mode',
  async ({ remote }) => {
    const onChange = vi.fn<(value: RelationshipValue | null) => void>();
    const loadOptions = remote ? () => Promise.resolve(options) : undefined;
    const props = {
      mode: 'single' as const,
      label: 'Related document',
      collections,
      options,
      value: { collection: 'articles', id: '1', label: 'Selected article' },
      onChange,
      appearance: 'select' as const,
      maxRows: 1,
      labels,
      ...(loadOptions ? { loadOptions } : {}),
    };
    const { rerender } = render(<RelationshipInput {...props} />);
    await waitFor(() => expect(screen.getByRole('option', { name: 'Media: Hero' })).toBeTruthy());
    expect(screen.queryByText('Unavailable')).toBeNull();
    rerender(<RelationshipInput {...props} collections={[{ id: 'media', label: 'Media' }]} />);
    expect(screen.getByText('Selected article')).toBeTruthy();
    expect(screen.getByText('Unavailable')).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
    rerender(<RelationshipInput {...props} />);
    expect(screen.queryByText('Unavailable')).toBeNull();
  },
);

it('resolves selected availability by composite identity and retains asynchronous values outside the current page', async () => {
  render(
    <RelationshipInput
      mode="multiple"
      label="Related documents"
      collections={collections}
      options={[{ collection: 'media', id: '1', label: 'Hero', available: false }]}
      value={[
        { collection: 'articles', id: '1', label: 'Selected article' },
        { collection: 'articles', id: 'off-page', label: 'Off-page article' },
      ]}
      loadOptions={() => Promise.resolve(options)}
      onChange={vi.fn<(value: RelationshipValue[]) => void>()}
      appearance="select"
      maxRows={3}
      labels={labels}
    />,
  );
  await waitFor(() => expect(screen.getByRole('option', { name: 'Media: Hero' })).toBeTruthy());
  expect(screen.getByText('Selected article')).toBeTruthy();
  expect(screen.getByText('Off-page article')).toBeTruthy();
  expect(screen.queryByText('Unavailable')).toBeNull();
});

it('readOnly prevents selection, removal, reordering and create or edit events', () => {
  const onChange = vi.fn<(value: readonly RelationshipValue[]) => void>();
  const onCreate = vi.fn<(collection: string) => void>();
  const onEdit = vi.fn<(value: RelationshipValue) => void>();
  render(
    <RelationshipInput
      mode="multiple"
      label="Related documents"
      collections={collections}
      options={options}
      value={[{ collection: 'articles', id: '1', label: 'Welcome' }]}
      onChange={onChange}
      onCreate={onCreate}
      onEdit={onEdit}
      appearance="drawer"
      maxRows={3}
      labels={labels}
      readOnly
    />,
  );
  expect(screen.getByText('Welcome')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remove Welcome' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Welcome' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Create Articles' })).toBeNull();
  expect(onChange).not.toHaveBeenCalled();
  expect(onCreate).not.toHaveBeenCalled();
  expect(onEdit).not.toHaveBeenCalled();
});

it('cancels stale searches and ignores an old response arriving after a newer result', async () => {
  const first = deferred<readonly RelationshipOption[]>();
  const second = deferred<readonly RelationshipOption[]>();
  const signals: AbortSignal[] = [];
  const loadOptions = vi.fn<
    (request: {
      query: string;
      collection: string | null;
      signal: AbortSignal;
    }) => Promise<readonly RelationshipOption[]>
  >(({ signal }) => {
    signals.push(signal);
    return signals.length === 1 ? first.promise : second.promise;
  });
  render(
    <RelationshipInput
      mode="single"
      label="Related document"
      collections={collections}
      options={[]}
      value={null}
      onChange={vi.fn<(value: RelationshipValue | null) => void>()}
      loadOptions={loadOptions}
      appearance="select"
      maxRows={1}
      labels={labels}
    />,
  );
  await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(1));
  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'new' } });
  await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(2));
  expect(signals[0]?.aborted).toBe(true);
  await act(async () => {
    second.resolve([{ collection: 'articles', id: 'new', label: 'New document' }]);
    await second.promise;
  });
  expect(screen.getByRole('option', { name: 'Articles: New document' })).toBeTruthy();
  await act(async () => {
    first.resolve([{ collection: 'articles', id: 'old', label: 'Old document' }]);
    await first.promise;
  });
  expect(screen.queryByRole('option', { name: 'Articles: Old document' })).toBeNull();
});

it('supports single-value replacement, removal, clearing and keyboard option navigation', () => {
  const onChange = vi.fn<(value: RelationshipValue | null) => void>();
  const props = {
    mode: 'single' as const,
    label: 'Related document',
    collections,
    options,
    value: null,
    onChange,
    appearance: 'select' as const,
    maxRows: 1,
    labels,
  };
  const { rerender } = render(<RelationshipInput {...props} />);
  const search = screen.getByLabelText('Search documents');
  search.focus();
  fireEvent.keyDown(search, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Articles: Welcome' }));
  fireEvent.keyDown(document.activeElement ?? search, { key: 'ArrowDown' });
  expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Media: Hero' }));
  fireEvent.keyDown(document.activeElement ?? search, { key: 'Home' });
  fireEvent.keyDown(document.activeElement ?? search, { key: 'End' });
  fireEvent.keyDown(document.activeElement ?? search, { key: 'ArrowUp' });
  fireEvent.keyDown(document.activeElement ?? search, { key: 'Tab' });
  fireEvent.click(screen.getByRole('option', { name: 'Media: Hero' }));
  expect(onChange).toHaveBeenLastCalledWith({ collection: 'media', id: '1', label: 'Hero' });
  rerender(
    <RelationshipInput {...props} value={{ collection: 'media', id: '1', label: 'Hero' }} />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove Hero' }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(onChange).toHaveBeenLastCalledWith(null);
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'media' },
  });
  expect(screen.queryByRole('option', { name: 'Articles: Welcome' })).toBeNull();
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'not found' } });
  expect(screen.getByText('No documents found')).toBeTruthy();
});

it('shows async search errors, retries, and aborts the remaining request on unmount', async () => {
  const pending = deferred<readonly RelationshipOption[]>();
  let signal: AbortSignal | undefined;
  const loadOptions = vi
    .fn<
      (request: {
        query: string;
        collection: string | null;
        signal: AbortSignal;
      }) => Promise<readonly RelationshipOption[]>
    >()
    .mockRejectedValueOnce(new Error('Private backend failure'))
    .mockResolvedValueOnce(options)
    .mockImplementationOnce((input) => {
      ({ signal } = input);
      return pending.promise;
    });
  const { unmount } = render(
    <RelationshipInput
      mode="single"
      label="Related document"
      collections={collections}
      options={[]}
      value={null}
      onChange={vi.fn<(value: RelationshipValue | null) => void>()}
      loadOptions={loadOptions}
      appearance="select"
      maxRows={1}
      labels={labels}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Could not load documents'),
  );
  expect(screen.queryByText('Private backend failure')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry documents' }));
  await waitFor(() => expect(screen.getByRole('option', { name: 'Media: Hero' })).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Search documents'), { target: { value: 'pending' } });
  await waitFor(() => expect(loadOptions).toHaveBeenCalledTimes(3));
  unmount();
  expect(signal?.aborted).toBe(true);
  pending.resolve([]);
  await pending.promise;
});

it('does not show documents rejected by a filter or an unknown collection', () => {
  render(
    <RelationshipInput
      mode="single"
      label="Related document"
      collections={collections}
      options={[...options, { collection: 'secret', id: '1', label: 'Hidden document' }]}
      value={null}
      onChange={vi.fn<(value: RelationshipValue | null) => void>()}
      filterOption={(option) => option.collection !== 'articles'}
      appearance="select"
      maxRows={1}
      labels={labels}
    />,
  );
  expect(screen.queryByRole('option', { name: 'Articles: Welcome' })).toBeNull();
  expect(screen.queryByText('Hidden document')).toBeNull();
  expect(screen.getByRole('option', { name: 'Media: Hero' })).toBeTruthy();
});
