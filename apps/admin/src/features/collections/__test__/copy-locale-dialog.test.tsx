import { z } from 'zod';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  collection,
  record,
  descriptor,
  recordId,
  pageApi,
  resetPageApi,
  defaultPageRequest,
  ok,
} from './page-fixture';
import {
  renderManagement,
  ManagementTestProvider,
} from '../../../../../../test/support/admin-management';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { DocumentEditorPage } from '../editor-page';
import { CopyLocaleDialog } from '../copy-locale-dialog';

beforeEach(resetPageApi);
const editorSessionId = '10000000-0000-4000-8000-000000000099';
function props() {
  return {
    snapshot: { collection, editor: descriptor(), document: record() },
    editorSessionId,
    onClose: vi.fn<() => void>(),
    onRefresh: vi.fn<() => void>(),
    onCopied: vi.fn<(locale: string, id: string) => void>(),
  };
}
it('opens the real editor entry, persists the chosen overwrite mode and navigates to the destination language', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.copyLocale'
      ? Promise.resolve(ok(record({ revision: 4 })))
      : defaultPageRequest(input),
  );
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const trigger = await screen.findByRole('button', { name: 'More actions' });
  await userEvent.click(trigger);
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy to another language' }));
  const dialog = await screen.findByRole('dialog', { name: 'Copy to another language' });
  expect(dialog).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Source language' })).toHaveValue('en');
  fireEvent.change(screen.getByRole('combobox', { name: 'Copy mode' }), {
    target: { value: 'overwrite' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Copy to another language' }));
  await waitFor(() =>
    expect(pageApi.push).toHaveBeenCalledWith(
      `/dashboard/collections/articles/${recordId}?locale=zh-CN`,
      undefined,
    ),
  );
  const request = pageApi.request.mock.calls.find(
    ([input]) => input.operation === 'documents.copyLocale',
  )?.[0];
  expect(request).toMatchObject({
    params: { collection: 'articles', id: recordId },
    body: { revision: 3, fromLocale: 'en', toLocale: 'zh-CN', overwrite: true },
  });
  expect(z.object({ editorSessionId: z.uuid() }).safeParse(request).success).toBe(true);
});
it('retries an uncertain copy using the same body and idempotency key while locking its fields', async () => {
  const input = props();
  pageApi.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(ok(record()));
  renderManagement(<CopyLocaleDialog {...input} />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy to another language' }));
  await screen.findByRole('button', { name: 'Verify the same copy request' });
  expect(screen.getByRole('combobox', { name: 'Target language' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Verify the same copy request' }));
  await waitFor(() => expect(input.onCopied).toHaveBeenCalledWith('zh-CN', recordId));
  const calls = pageApi.request.mock.calls.map(([request]) => request);
  expect(calls).toHaveLength(2);
  for (const call of calls)
    expect(call).toMatchObject({
      body: { revision: 3, fromLocale: 'en', toLocale: 'zh-CN', overwrite: false },
      editorSessionId,
    });
  expect(calls[1]?.idempotencyKey).toBe(calls[0]?.idempotencyKey);
});
it('requires a deliberate refresh after a revision conflict instead of submitting another copy', async () => {
  const input = props();
  pageApi.request.mockResolvedValue(failure('version_conflict', 409));
  renderManagement(<CopyLocaleDialog {...input} />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy to another language' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Refresh current document' }));
  expect(input.onRefresh).toHaveBeenCalledTimes(1);
  expect(pageApi.request).toHaveBeenCalledTimes(1);
});
it('aborts the copy on unmount and ignores a late response without navigating', async () => {
  const input = props();
  let finish: ((result: ApiResult<unknown>) => void) | undefined;
  pageApi.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderManagement(<CopyLocaleDialog {...input} />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy to another language' }));
  const signal = pageApi.request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.(ok(record()));
    await Promise.resolve();
  });
  expect(input.onCopied).not.toHaveBeenCalled();
});
it('does not offer locale copying after its operation permission is revoked', async () => {
  pageApi.denied.add('documents.copyLocale');
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const trigger = await screen.findByRole('button', { name: 'More actions' });
  await userEvent.click(trigger);
  await screen.findByRole('menuitem', { name: 'Copy document' });
  await screen.findByRole('menuitem', { name: 'Copy document' });
  expect(
    screen.queryByRole('menuitem', { name: 'Copy to another language' }),
  ).not.toBeInTheDocument();
});

it('requires refreshing when the saved source changes while the dialog is open', async () => {
  const input = props();
  const view = renderManagement(<CopyLocaleDialog {...input} />);
  view.rerender(
    <ManagementTestProvider>
      <CopyLocaleDialog
        {...input}
        snapshot={{
          ...input.snapshot,
          document: record({ versionId: '10000000-0000-4000-8000-000000000003' }),
        }}
      />
    </ManagementTestProvider>,
  );
  expect(
    screen.getByText('The saved document changed. Refresh before copying.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy to another language' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh current document' }));
  expect(input.onRefresh).toHaveBeenCalledTimes(1);
  expect(pageApi.request).not.toHaveBeenCalled();
});
it('does not submit without a saved source or a different configured destination', () => {
  const input = props();
  const view = renderManagement(
    <CopyLocaleDialog {...input} snapshot={{ ...input.snapshot, document: null }} />,
  );
  expect(screen.getByRole('button', { name: 'Copy to another language' })).toBeDisabled();
  view.unmount();
  renderManagement(
    <CopyLocaleDialog
      {...input}
      snapshot={{
        ...input.snapshot,
        editor: {
          ...input.snapshot.editor,
          locales: { default: 'en', supported: ['en'], fallback: { en: [] } },
        },
      }}
    />,
  );
  expect(screen.queryByRole('option', { name: 'zh-CN' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copy to another language' })).toBeDisabled();
  expect(pageApi.request).not.toHaveBeenCalled();
});

it('submits another configured target selected by the user', async () => {
  const input = props();
  pageApi.request.mockResolvedValue(ok(record()));
  renderManagement(
    <CopyLocaleDialog
      {...input}
      snapshot={{
        ...input.snapshot,
        editor: {
          ...input.snapshot.editor,
          locales: {
            default: 'en',
            supported: ['en', 'zh-CN', 'de'],
            fallback: { en: [], de: [], 'zh-CN': [] },
          },
        },
      }}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Target language' }), {
    target: { value: 'de' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Copy to another language' }));
  await waitFor(() => expect(input.onCopied).toHaveBeenCalledWith('de', recordId));
  expect(pageApi.request.mock.calls[0]?.[0].body).toEqual({
    revision: 3,
    fromLocale: 'en',
    toLocale: 'de',
    overwrite: false,
  });
});
it('cancels the real locale dialog without leaving the editor busy or submitting content', async () => {
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Copy to another language' }));
  await screen.findByRole('dialog', { name: 'Copy to another language' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() =>
    expect(
      screen.queryByRole('dialog', { name: 'Copy to another language' }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
  expect(
    pageApi.request.mock.calls.some(([input]) => input.operation === 'documents.copyLocale'),
  ).toBe(false);
});
