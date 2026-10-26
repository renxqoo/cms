import { beforeEach, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestApi } from '../../../api/client';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { document, success, deferred } from './support';
import { contentMessages } from '../messages';
import { DefaultLanguageControl } from '../languages/default-language';
vi.mock('../../../api/client', () => ({ requestApi: vi.fn<typeof requestApi>() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/collections/languages',
  useRouter: () => ({
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
  }),
}));
const request = vi.mocked(requestApi);
beforeEach(() => {
  request.mockReset();
});
const target = () =>
  document({ collection: 'languages', data: { code: 'zh', enabled: true, default: false } });
const catalog = () => ({
  rows: [document({ collection: 'languages', data: { code: 'en', enabled: true, default: true } })],
  total: 1,
  page: 1,
  pageSize: 1,
});
function setup(permitted = true) {
  const changed = vi.fn<() => void>(),
    busy = vi.fn<(value: boolean) => void>(),
    report = vi.fn<(result: ApiResult<unknown>) => void>();
  const view = renderManagement(
    <DefaultLanguageControl
      document={target()}
      permitted={permitted}
      disabled={false}
      onChanged={changed}
      onBusy={busy}
      report={report}
      t={contentMessages.en}
    />,
  );
  return { ...view, changed, busy, report };
}
it('uses the observed default and saved revision in one explicit atomic switch', async () => {
  const view = setup();
  request.mockResolvedValueOnce(success(catalog())).mockResolvedValueOnce(success(target()));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Set as default language' }));
  await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    operation: 'languages.setDefault',
    params: { collection: 'languages', id: target().id },
    body: { revision: target().revision, expectedDefaultCode: 'en' },
  });
  expect(request.mock.calls[1]?.[0].idempotencyKey).toEqual(expect.any(String));
  expect(view.busy).toHaveBeenLastCalledWith(false);
});
it('does not expose a default switch without its permission', () => {
  setup(false);
  expect(screen.queryByRole('button', { name: 'Set as default language' })).not.toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
});
it('aborts a pending catalog read on unmount and ignores its late result', async () => {
  const pending = deferred<ApiResult<unknown>>();
  request.mockImplementationOnce(() => pending.promise);
  const view = setup();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Set as default language' }));
  const signal = request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  pending.resolve(success(catalog()));
  await Promise.resolve();
  expect(request).toHaveBeenCalledOnce();
  expect(view.changed).not.toHaveBeenCalled();
});

it('preserves the same intent when retrying an uncertain atomic switch', async () => {
  const view = setup();
  request
    .mockResolvedValueOnce(success(catalog()))
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success(target()));
  const user = userEvent.setup(),
    button = screen.getByRole('button', { name: 'Set as default language' });
  await user.click(button);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  await waitFor(() => expect(view.changed).toHaveBeenCalledOnce());
  expect(request.mock.calls[2]?.[0].idempotencyKey).toBe(request.mock.calls[1]?.[0].idempotencyKey);
  expect(request.mock.calls[2]?.[0].body).toEqual(request.mock.calls[1]?.[0].body);
});
it('rejects an inconsistent default catalog before sending a write', async () => {
  const view = setup();
  request.mockResolvedValueOnce(success({ ...catalog(), total: 0, rows: [] }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Set as default language' }));
  await waitFor(() => expect(view.report).toHaveBeenCalledOnce());
  expect(view.report.mock.calls[0]?.[0]).toMatchObject({
    ok: false,
    error: { code: 'invalid_response' },
  });
  expect(request).toHaveBeenCalledOnce();
  expect(view.changed).not.toHaveBeenCalled();
});
it('reports a denied default read without sending a write', async () => {
  const view = setup();
  request.mockResolvedValueOnce(failure('forbidden', 403));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Set as default language' }));
  await waitFor(() => expect(view.report).toHaveBeenCalledOnce());
  expect(request).toHaveBeenCalledOnce();
  expect(view.changed).not.toHaveBeenCalled();
});
it('aborts an in-flight default write and ignores its late success', async () => {
  const pending = deferred<ApiResult<unknown>>();
  request.mockResolvedValueOnce(success(catalog())).mockImplementationOnce(() => pending.promise);
  const view = setup();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Set as default language' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  const signal = request.mock.calls[1]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  pending.resolve(success(target()));
  await Promise.resolve();
  expect(view.changed).not.toHaveBeenCalled();
  expect(view.report).not.toHaveBeenCalled();
});
