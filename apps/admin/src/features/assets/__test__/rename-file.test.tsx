import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { document, collection, editor, success } from './support';
import { RenameFile } from '../rename-file';
import type { DocumentMediaProps } from '../document-media';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';

interface Request {
  operation: string;
  signal: AbortSignal;
  body?: unknown;
  params?: unknown;
  editorSessionId?: string;
  idempotencyKey?: string;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(request: Request) => Promise<ApiResult<unknown>>>(),
  denied: new Set<string>(),
  adapter: {
    subscribe: (_listener: unknown) => () => {},
    commit: (_attempt: unknown) => {},
    cancel: (_attempt: unknown) => {},
  },
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    can: (operation: string) => !mocks.denied.has(operation),
    reportResult: () => {},
  }),
}));
vi.mock('../../../components/shell/shell-provider', () => ({ useShell: () => 'en' }));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => ({ adapter: mocks.adapter }),
}));
vi.mock('next-intl', () => ({ useTranslations: () => () => '' }));
beforeEach(() => {
  mocks.request.mockReset();
  mocks.denied.clear();
});
function props(): DocumentMediaProps {
  return {
    document,
    collection,
    editor: {
      ...editor,
      actions: [...editor.actions, { operationId: 'documents.renameFile', state: 'conditional' }],
    },
    editorSessionId: '10000000-0000-4000-8000-000000000099',
    onDocumentChanged: vi.fn<() => Promise<void>>().mockResolvedValue(),
    onBusyChange: vi.fn<(value: boolean) => void>(),
  };
}
async function open() {
  await userEvent.click(screen.getByRole('button', { name: 'Rename file' }));
  await screen.findByRole('dialog', { name: 'Rename file' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Filename' }), {
    target: { value: 'New.png' },
  });
}
it('renames with the saved revision, logical locale and editor session and waits for refresh before closing', async () => {
  const input = props();
  let finish: (() => void) | undefined;
  input.onDocumentChanged = vi.fn<() => Promise<void>>(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  mocks.request.mockResolvedValue(success(document));
  render(<RenameFile {...input} />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Rename file' }));
  await waitFor(() => expect(input.onDocumentChanged).toHaveBeenCalledOnce());
  expect(screen.getByRole('textbox', { name: 'Filename' })).toBeDisabled();
  expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.renameFile',
    params: { collection: 'media', id: document.id },
    body: { revision: document.revision, locale: 'en', filename: 'New.png' },
    editorSessionId: input.editorSessionId,
  });
  act(() => {
    finish?.();
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(input.onBusyChange).toHaveBeenLastCalledWith(false);
});
it('replays an uncertain rename with the exact original body and idempotency key and completes refresh', async () => {
  const input = props();
  mocks.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success(document));
  render(<RenameFile {...input} />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Rename file' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Verify the same rename request' }),
  );
  await waitFor(() => expect(input.onDocumentChanged).toHaveBeenCalledOnce());
  const calls = mocks.request.mock.calls.map(([request]) => request);
  expect(calls).toHaveLength(2);
  expect(calls[1]?.body).toEqual(calls[0]?.body);
  expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});
it('offers a deliberate refresh after a revision conflict and after the saved rename cannot be refreshed', async () => {
  const input = props();
  mocks.request.mockResolvedValueOnce(failure('version_conflict', 409));
  render(<RenameFile {...input} />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Rename file' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Refresh current document' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('retains a refresh recovery action when rename committed but refresh failed, without issuing another rename', async () => {
  const input = props();
  input.onDocumentChanged = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('Read failed'))
    .mockResolvedValueOnce();
  mocks.request.mockResolvedValueOnce(success(document));
  render(<RenameFile {...input} />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Rename file' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Refresh current document' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(input.onDocumentChanged).toHaveBeenCalledTimes(2);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it('aborts on unmount and ignores late success without refreshing the document', async () => {
  const input = props();
  let finish: ((value: ApiResult<unknown>) => void) | undefined;
  mocks.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(<RenameFile {...input} />);
  await open();
  await userEvent.click(screen.getByRole('button', { name: 'Rename file' }));
  const signal = mocks.request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  act(() => {
    finish?.(success(document));
  });
  expect(input.onDocumentChanged).not.toHaveBeenCalled();
  expect(input.onBusyChange).toHaveBeenLastCalledWith(false);
});
it('requires a file, an editing view and both current metadata and operation permissions', () => {
  const input = props();
  const view = render(<RenameFile {...input} document={{ ...document, file: undefined }} />);
  expect(screen.queryByRole('button', { name: 'Rename file' })).toBeNull();
  view.rerender(
    <>
      <RenameFile {...input} editor={{ ...input.editor, mode: 'published' }} />
    </>,
  );
  expect(screen.queryByRole('button', { name: 'Rename file' })).toBeNull();
  mocks.denied.add('documents.renameFile');
  view.rerender(
    <>
      <RenameFile {...input} />
    </>,
  );
  expect(screen.queryByRole('button', { name: 'Rename file' })).toBeNull();
  mocks.denied.clear();
  view.rerender(
    <>
      <RenameFile {...input} editor={{ ...input.editor, actions: [] }} />
    </>,
  );
  expect(screen.queryByRole('button', { name: 'Rename file' })).toBeNull();
});
