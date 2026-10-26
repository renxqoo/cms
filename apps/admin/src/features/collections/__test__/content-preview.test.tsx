import { expect, it, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestApi } from '../../../api/client';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { ContentPreviewControl } from '../preview/content-preview';
import { contentMessages } from '../messages';
import { success, deferred } from './support';
import type { ApiResult } from '../../../api/result';
vi.mock('../../../api/client', () => ({ requestApi: vi.fn<typeof requestApi>() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/collections/models',
  useRouter: () => ({
    push: vi.fn<(href: string) => void>(),
    replace: vi.fn<(href: string) => void>(),
  }),
}));
const request = vi.mocked(requestApi);
const target = {
  collection: 'models',
  id: '11111111-1111-4111-8111-111111111111',
  revision: 7,
  locale: 'en',
};
const ticket = () => ({
  ticketId: '22222222-2222-4222-8222-222222222222',
  expiresAt: new Date(Date.now() + 600000).toISOString(),
  url: `https://client.example.test/api/content-preview?slug=alpha&locale=en&grant=${'A'.repeat(43)}`,
});
beforeEach(() => request.mockReset());
function setup(extra: { disabled?: boolean; permitted?: boolean } = {}) {
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const view = renderManagement(
    <ContentPreviewControl
      target={target}
      disabled={extra.disabled ?? false}
      permitted={extra.permitted ?? true}
      canRevoke
      t={contentMessages.en}
      report={report}
    />,
  );
  return { ...view, report };
}
it('issues an explicit saved-revision preview, opens the trusted handoff, and revokes every copy', async () => {
  const user = userEvent.setup();
  setup();
  await user.click(screen.getByRole('button', { name: 'Draft preview' }));
  expect(request).not.toHaveBeenCalled();
  const issued = ticket();
  request.mockResolvedValueOnce(success(issued));
  await user.click(screen.getByRole('button', { name: 'Generate preview link' }));
  const link = await screen.findByRole('link', { name: 'Open draft preview' });
  expect(link).toHaveAttribute('href', issued.url);
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  expect(request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.createPreviewTicket',
    params: { collection: 'models', id: target.id },
    body: { locale: 'en', expectedRevision: 7 },
  });
  request.mockResolvedValueOnce(success({ revoked: true }));
  await user.click(screen.getByRole('button', { name: 'Revoke preview link' }));
  await waitFor(() =>
    expect(screen.queryByRole('link', { name: 'Open draft preview' })).not.toBeInTheDocument(),
  );
  expect(request.mock.calls[1]?.[0]).toMatchObject({
    operation: 'documents.revokePreviewTicket',
    params: { collection: 'models', id: target.id, ticketId: issued.ticketId },
  });
});
it('never issues previews without permission or while unsaved changes block the entry', () => {
  const view = setup({ permitted: false });
  expect(screen.queryByRole('button', { name: 'Draft preview' })).not.toBeInTheDocument();
  view.unmount();
  setup({ disabled: true });
  expect(screen.getByRole('button', { name: 'Draft preview' })).toBeDisabled();
  expect(request).not.toHaveBeenCalled();
});
it('cancels an in-flight ticket request on unmount and ignores its late result', async () => {
  const user = userEvent.setup();
  const pending = deferred<ApiResult<unknown>>();
  request.mockImplementationOnce(() => pending.promise);
  const view = setup();
  await user.click(screen.getByRole('button', { name: 'Draft preview' }));
  await user.click(screen.getByRole('button', { name: 'Generate preview link' }));
  const signal = request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
  pending.resolve(success(ticket()));
  await pending.promise;
  expect(view.report).not.toHaveBeenCalled();
});
