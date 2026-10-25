import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { BulkDocumentActions } from '../bulk-document-actions';
import type { BulkDocumentActionsProps, BulkActionResult } from '../bulk-document-actions';
import { DocumentState } from '../document-state';
import type { DocumentStateProps } from '../document-state';
import { DocumentActions } from '../document-actions';
import type { DocumentActionsProps } from '../document-actions';
import { useCmsAction } from '../use-cms-action';
import type { AsyncResult } from '@new-cms/ui/overlays';
import { getCmsMessages } from '../../../features/ui-lab/cms-messages';

afterEach(cleanup);

const copy = getCmsMessages('en');
const selected = [
  { collection: 'articles', id: '1', label: 'First' },
  { collection: 'media', id: '1', label: 'Second' },
];
const bulkLabels = {
  action: 'Apply batch',
  success: 'Accepted',
  error: 'Unable to apply batch',
  empty: 'Select documents',
  cancel: 'Cancel batch',
  confirmationTitle: 'Confirm batch action',
  confirmationDescription: 'Apply this action to all selected documents?',
  confirm: 'Confirm batch',
  close: 'Close batch',
};

function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!complete) throw new Error('Resolver missing');
      complete(value);
    },
  };
}

it('reports each partial bulk result against its composite document identity', async () => {
  const onAction = vi.fn<BulkDocumentActionsProps['onAction']>(() =>
    Promise.resolve({
      status: 'success',
      items: [
        { collection: 'articles', id: '1', status: 'success' },
        { collection: 'media', id: '1', status: 'error', message: 'Locked document' },
      ],
    }),
  );
  render(
    <BulkDocumentActions
      selected={selected}
      action="publish"
      labels={bulkLabels}
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apply batch' }));
  await waitFor(() => expect(screen.getByText('First: Accepted')).toBeTruthy());
  expect(screen.getByText('Second: Locked document')).toBeTruthy();
  expect(onAction).toHaveBeenCalledTimes(1);
});

it('regression: a destructive bulk action waits for explicit confirmation', async () => {
  const onAction = vi.fn<BulkDocumentActionsProps['onAction']>(() =>
    Promise.resolve({
      status: 'success',
      items: selected.map((item) => ({ ...item, status: 'success' })),
    }),
  );
  render(
    <BulkDocumentActions
      selected={selected}
      action="delete"
      labels={bulkLabels}
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apply batch' }));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm batch' }));
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
});

it.each([
  { items: [{ collection: 'articles', id: '1', status: 'success' as const }] },
  {
    items: [
      { collection: 'articles', id: '1', status: 'success' as const },
      { collection: 'articles', id: '1', status: 'success' as const },
    ],
  },
  {
    items: [
      { collection: 'articles', id: '1', status: 'success' as const },
      { collection: 'unknown', id: '1', status: 'success' as const },
    ],
  },
])('rejects incomplete, duplicate or unrelated bulk results', async ({ items }) => {
  render(
    <BulkDocumentActions
      selected={selected}
      action="publish"
      labels={bulkLabels}
      onAction={() => Promise.resolve({ status: 'success', items })}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apply batch' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Unable to apply batch'));
  expect(screen.queryByText('First: Accepted')).toBeNull();
});

it('disables an empty bulk selection and exposes an explicit top-level failure', async () => {
  const onAction = vi.fn<BulkDocumentActionsProps['onAction']>(() =>
    Promise.resolve({ status: 'error', message: 'Permission denied' }),
  );
  const { rerender } = render(
    <BulkDocumentActions selected={[]} action="delete" labels={bulkLabels} onAction={onAction} />,
  );
  expect(screen.getByRole('button', { name: 'Apply batch' })).toHaveProperty('disabled', true);
  expect(screen.getByText('Select documents')).toBeTruthy();
  rerender(
    <BulkDocumentActions
      selected={selected}
      action="delete"
      labels={bulkLabels}
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apply batch' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm batch' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Permission denied'));
});

it('cancels a pending bulk action and ignores its late completion after selection changes', async () => {
  const pending = deferred<BulkActionResult>();
  let signal: AbortSignal | undefined;
  const onAction: BulkDocumentActionsProps['onAction'] = (_action, input) => {
    ({ signal } = input);
    return pending.promise;
  };
  const { rerender } = render(
    <BulkDocumentActions
      selected={selected}
      action="publish"
      labels={bulkLabels}
      onAction={onAction}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apply batch' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel batch' }));
  expect(signal?.aborted).toBe(true);
  rerender(
    <BulkDocumentActions
      selected={[{ collection: 'articles', id: 'next', label: 'New selection' }]}
      action="publish"
      labels={bulkLabels}
      onAction={onAction}
    />,
  );
  await act(async () => {
    pending.resolve({
      status: 'success',
      items: selected.map((item) => ({ ...item, status: 'success' })),
    });
    await pending.promise;
  });
  expect(screen.queryByText('First: Accepted')).toBeNull();
});

it('requires takeover confirmation, preserves failure for retry and leaves lock facts controlled', async () => {
  const onTakeover = vi
    .fn<NonNullable<DocumentStateProps['onTakeover']>>()
    .mockResolvedValueOnce({ status: 'error', message: 'Lease changed' })
    .mockResolvedValueOnce({ status: 'success' });
  render(
    <DocumentState
      dirty
      lock={{ ownerName: 'Casey', isOwnedByCurrentUser: false }}
      conflict={false}
      labels={copy.state}
      onTakeover={onTakeover}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Request takeover' }));
  expect(onTakeover).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Lease changed'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(onTakeover).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Document occupied by: Casey')).toBeTruthy();
});

it('shows owned locks and conflict restore without offering takeover', async () => {
  const onRestore = vi.fn<NonNullable<DocumentStateProps['onRestore']>>(() =>
    Promise.resolve({ status: 'success' }),
  );
  render(
    <DocumentState
      dirty={false}
      lock={{ ownerName: 'Alex', isOwnedByCurrentUser: true }}
      conflict
      labels={copy.state}
      onRestore={onRestore}
    />,
  );
  expect(screen.getByText('Current occupant: Alex')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Request takeover' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View restore event' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onRestore).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'View restore event' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(onRestore).toHaveBeenCalledTimes(1));
});

it.each([
  { fact: 'released lock', lock: null },
  { fact: 'owned lock', lock: { ownerName: 'Casey', isOwnedByCurrentUser: true } },
  { fact: 'different occupant', lock: { ownerName: 'Robin', isOwnedByCurrentUser: false } },
])('regression: $fact invalidates an open takeover confirmation', ({ lock }) => {
  const onTakeover = vi.fn<NonNullable<DocumentStateProps['onTakeover']>>(() =>
    Promise.resolve({ status: 'success' }),
  );
  const props: DocumentStateProps = {
    dirty: true,
    lock: { ownerName: 'Casey', isOwnedByCurrentUser: false },
    conflict: false,
    labels: copy.state,
    onTakeover,
  };
  const { rerender } = render(<DocumentState {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Request takeover' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  rerender(<DocumentState {...props} lock={lock} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onTakeover).not.toHaveBeenCalled();
  rerender(<DocumentState {...props} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('regression: clearing a conflict invalidates its open restore confirmation without reopening it later', () => {
  const onRestore = vi.fn<NonNullable<DocumentStateProps['onRestore']>>(() =>
    Promise.resolve({ status: 'success' }),
  );
  const props: DocumentStateProps = {
    dirty: false,
    lock: null,
    conflict: true,
    labels: copy.state,
    onRestore,
  };
  const { rerender } = render(<DocumentState {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'View restore event' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
  rerender(<DocumentState {...props} conflict={false} />);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onRestore).not.toHaveBeenCalled();
  rerender(<DocumentState {...props} />);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it.each([
  { action: 'takeover' as const, trigger: 'Request takeover' },
  { action: 'restore' as const, trigger: 'View restore event' },
])(
  'regression: withdrawing the $action handler closes an obsolete confirmation',
  ({ action, trigger }) => {
    const handler = vi.fn<(input: { signal: AbortSignal }) => Promise<AsyncResult>>(() =>
      Promise.resolve({ status: 'success' }),
    );
    const facts = {
      dirty: false,
      lock: { ownerName: 'Casey', isOwnedByCurrentUser: false },
      conflict: true,
      labels: copy.state,
    };
    const { rerender } = render(
      <DocumentState
        {...facts}
        {...(action === 'takeover' ? { onTakeover: handler } : { onRestore: handler })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: trigger }));
    rerender(<DocumentState {...facts} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  },
);

it.each([
  { action: 'takeover' as const, trigger: 'Request takeover', oldStatus: 'success' as const },
  { action: 'takeover' as const, trigger: 'Request takeover', oldStatus: 'error' as const },
  { action: 'restore' as const, trigger: 'View restore event', oldStatus: 'success' as const },
  { action: 'restore' as const, trigger: 'View restore event', oldStatus: 'error' as const },
])(
  'regression: invalidated $action requests abort and late $oldStatus cannot pollute a new StrictMode confirmation',
  async ({ action, trigger, oldStatus }) => {
    const previous = deferred<AsyncResult>();
    const current = deferred<AsyncResult>();
    const signals: AbortSignal[] = [];
    const handler = vi.fn<(input: { signal: AbortSignal }) => Promise<AsyncResult>>(
      ({ signal }) => {
        signals.push(signal);
        return signals.length === 1 ? previous.promise : current.promise;
      },
    );
    const props: DocumentStateProps = {
      dirty: false,
      lock: { ownerName: 'Casey', isOwnedByCurrentUser: false },
      conflict: true,
      labels: copy.state,
      ...(action === 'takeover' ? { onTakeover: handler } : { onRestore: handler }),
    };
    const { rerender } = render(
      <StrictMode>
        <DocumentState {...props} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: trigger }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(signals[0]?.aborted).toBe(false);
    rerender(
      <StrictMode>
        <DocumentState
          {...props}
          {...(action === 'takeover' ? { lock: null } : { conflict: false })}
        />
      </StrictMode>,
    );
    expect(signals[0]?.aborted).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(
      <StrictMode>
        <DocumentState {...props} />
      </StrictMode>,
    );
    fireEvent.click(screen.getByRole('button', { name: trigger }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(signals[1]?.aborted).toBe(false);
    await act(async () => {
      previous.resolve(
        oldStatus === 'success'
          ? { status: 'success' }
          : { status: 'error', message: 'Obsolete operation failed' },
      );
      await previous.promise;
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByText('Obsolete operation failed')).toBeNull();
    expect(signals[1]?.aborted).toBe(false);
    await act(async () => {
      current.resolve({ status: 'error', message: 'Current operation failed' });
      await current.promise;
    });
    expect(screen.getByRole('alert').textContent).toContain('Current operation failed');
  },
);

it('keeps a pending state action during unrelated dirty and label changes', async () => {
  const pending = deferred<AsyncResult>();
  let signal: AbortSignal | undefined;
  const props: DocumentStateProps = {
    dirty: false,
    lock: { ownerName: 'Casey', isOwnedByCurrentUser: false },
    conflict: false,
    labels: copy.state,
    onTakeover: (input) => {
      ({ signal } = input);
      return pending.promise;
    },
  };
  const { rerender } = render(<DocumentState {...props} />);
  fireEvent.click(screen.getByRole('button', { name: 'Request takeover' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  rerender(
    <DocumentState {...props} dirty labels={{ ...copy.state, unsaved: 'Edited locally' }} />,
  );
  expect(screen.getByText('Edited locally')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(signal?.aborted).toBe(false);
  await act(async () => {
    pending.resolve({ status: 'success' });
    await pending.promise;
  });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('keeps unknown document errors neutral, guards duplicate submission and allows retry', async () => {
  const pending = deferred<AsyncResult>();
  const task = vi.fn<(signal: AbortSignal) => Promise<AsyncResult>>(() => pending.promise);
  const { result } = renderHook(() => useCmsAction('Could not complete the action'));
  let first: Promise<AsyncResult | null> | undefined;
  act(() => {
    first = result.current.run(task);
  });
  expect(result.current.busy).toBe(true);
  await act(async () => {
    expect(await result.current.run(task)).toBeNull();
  });
  expect(task).toHaveBeenCalledTimes(1);
  await act(async () => {
    pending.resolve({ status: 'error', message: 'Version conflict' });
    await first;
  });
  expect(result.current.error).toBe('Version conflict');
  await act(async () => {
    await result.current.run(() => Promise.reject(new Error('Secret internal detail')));
  });
  expect(result.current.error).toBe('Could not complete the action');
  await act(async () => {
    await result.current.run(() => Promise.resolve({ status: 'success' }));
  });
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(false);
});

it('aborts the exact old task on scope changes and never aborts the new task', async () => {
  const first = deferred<AsyncResult>();
  const second = deferred<AsyncResult>();
  const signals: AbortSignal[] = [];
  const { result, rerender, unmount } = renderHook(({ scope }) => useCmsAction('Failed', scope), {
    initialProps: { scope: 'first' },
  });
  let old: Promise<AsyncResult | null> | undefined;
  act(() => {
    old = result.current.run((signal) => {
      signals.push(signal);
      return first.promise;
    });
  });
  rerender({ scope: 'second' });
  expect(signals[0]?.aborted).toBe(true);
  let current: Promise<AsyncResult | null> | undefined;
  act(() => {
    current = result.current.run((signal) => {
      signals.push(signal);
      return second.promise;
    });
  });
  expect(signals[1]?.aborted).toBe(false);
  await act(async () => {
    first.resolve({ status: 'error', message: 'Old error' });
    await old;
  });
  expect(result.current.error).toBeNull();
  expect(result.current.busy).toBe(true);
  unmount();
  expect(signals[1]?.aborted).toBe(true);
  second.resolve({ status: 'success' });
  expect(await current).toBeNull();
});

it('requires confirmation for withdrawal and prevents writing while a file is processing', async () => {
  const onAction = vi.fn<DocumentActionsProps['onAction']>(() =>
    Promise.resolve({ status: 'success' }),
  );
  const props: DocumentActionsProps = {
    mode: 'update',
    draftsEnabled: true,
    status: 'published',
    dirty: true,
    busy: false,
    uploadPending: true,
    permissions: { create: true, update: true, publish: true, delete: true },
    labels: copy.action,
    onAction,
  };
  const { rerender } = render(<DocumentActions {...props} previewUrl="javascript:alert(1)" />);
  for (const button of screen.getAllByRole('button'))
    expect(button).toHaveProperty('disabled', true);
  expect(screen.queryByRole('link')).toBeNull();
  rerender(<DocumentActions {...props} uploadPending={false} previewUrl="/preview" />);
  expect(screen.getByRole('link', { name: 'Preview' }).getAttribute('href')).toBe('/preview');
  fireEvent.click(screen.getByRole('button', { name: 'Return to local draft' }));
  expect(onAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm local action' }));
  await waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));
  expect(onAction.mock.calls[0]?.[0]).toBe('unpublish');
});
