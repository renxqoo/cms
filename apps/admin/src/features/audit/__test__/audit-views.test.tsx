import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  managementAudit,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { AuditPage } from '../audit-page';
import { AuditDetail } from '../audit-detail';
import { AuditFilterForm } from '../audit-filters';
import { parseAuditQuery } from '../audit-query';

interface Input {
  operation: string;
  query?: Record<string, unknown>;
  signal: AbortSignal;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: Input) => Promise<ApiResult<unknown>>>(),
  push: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  denied: new Set<string>(),
  phase: 'ready' as 'ready' | 'failed',
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: api.phase,
    can: (id: string) => !api.denied.has(id) && api.phase === 'ready',
    refresh: api.refresh,
    reportResult: api.report,
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/audit-logs',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: api.push, replace: vi.fn<() => void>() }),
}));
beforeEach(() => {
  api.phase = 'ready';
  api.denied.clear();
  api.request.mockImplementation((input) =>
    Promise.resolve(
      managementSuccess({
        rows: [managementAudit()],
        total: 1,
        page: Number(input.query?.page ?? 1),
        pageSize: Number(input.query?.pageSize ?? 20),
      }),
    ),
  );
});
afterEach(() => vi.resetAllMocks());

it('shows all safe server fields as text, supports copying and closes with Escape', async () => {
  const close = vi.fn<() => void>();
  const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  renderManagement(
    <AuditDetail
      record={managementAudit({
        detail: { note: '<script>bad()</script>', nested: [true, null, 42] },
      })}
      onClose={close}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Audit details' });
  expect(within(dialog).getByText('audit-request-abc')).toBeInTheDocument();
  expect(within(dialog).getByText(/<script>bad\(\)<\/script>/)).toBeInTheDocument();
  expect(dialog.querySelector('script')).toBeNull();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Copy details' }));
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith(
      JSON.stringify({ note: '<script>bad()</script>', nested: [true, null, 42] }, null, 2),
    ),
  );
  await userEvent.keyboard('{Escape}');
  expect(close).toHaveBeenCalled();
});

it('regression: an audit request ID can be copied independently from safe details', async () => {
  const writeText = vi.fn<(value: string) => Promise<void>>().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  renderManagement(<AuditDetail record={managementAudit()} onClose={vi.fn<() => void>()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Copy request ID' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('audit-request-abc'));
});

it('renders system actors and null target identities in Chinese without inventing administrator fields', async () => {
  const close = vi.fn<() => void>();
  renderManagement(
    <AuditDetail
      record={managementAudit({ actorKind: 'system', actorId: null, targetId: null })}
      onClose={close}
    />,
    'zh',
  );
  expect(screen.getByText('系统')).toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(2);
  await userEvent.click(screen.getByText('关闭', { selector: 'button' }));
  expect(close).toHaveBeenCalledOnce();
});

it('validates filters before applying an explicit UTC interval and clears through its public action', async () => {
  const apply = vi.fn<() => void>();
  const clear = vi.fn<() => void>();
  renderManagement(
    <AuditFilterForm
      query={parseAuditQuery(new URLSearchParams())}
      locale="en"
      onApply={apply}
      onClear={clear}
    />,
  );
  fireEvent.change(screen.getByLabelText('Actor ID'), { target: { value: 'wrong' } });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(apply).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Actor ID'), {
    target: { value: '66666666-6666-4666-8666-666666666666' },
  });
  fireEvent.change(screen.getByLabelText('From (UTC)'), { target: { value: '2026-10-01T00:00' } });
  fireEvent.change(screen.getByLabelText('To (UTC)'), { target: { value: '2026-10-26T00:00' } });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(apply).toHaveBeenCalledWith(
    expect.objectContaining({
      actorId: '66666666-6666-4666-8666-666666666666',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-26T00:00:00.000Z',
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(clear).toHaveBeenCalledOnce();
});

it('reads real audit rows, opens read-only details and updates URL search and UTC filters', async () => {
  renderManagement(<AuditPage />);
  await screen.findByText('roles.update');
  await userEvent.click(screen.getByRole('button', { name: 'View details' }));
  await screen.findByRole('dialog', { name: 'Audit details' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'request' },
  });
  await userEvent.click(screen.getByRole('button', { name: /^Search$/ }));
  expect(api.push).toHaveBeenCalledWith(
    '/dashboard/audit-logs?page=1&pageSize=20&order=desc&q=request',
    { scroll: false },
  );
  fireEvent.change(screen.getByLabelText('Target type'), { target: { value: 'role' } });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  expect(api.push).toHaveBeenCalledWith(
    '/dashboard/audit-logs?page=1&pageSize=20&order=desc&q=request&targetType=role',
    undefined,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  expect(api.push).toHaveBeenCalledWith('/dashboard/audit-logs?page=1&pageSize=20', undefined);
  expect(api.request.mock.calls.every(([input]) => input.operation === 'audit.list')).toBe(true);
});

it('does not issue reads without authorization and exposes authorization failure recovery', async () => {
  api.denied.add('audit.list');
  const view = renderManagement(<AuditPage />);
  expect(screen.getByText('You do not have permission to read audit logs.')).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
  view.unmount();
  api.denied.clear();
  api.phase = 'failed';
  renderManagement(<AuditPage />);
  expect(screen.getByText('Records could not be loaded.')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(api.refresh).toHaveBeenCalledOnce();
});

it('shows server failures honestly and retries the list without permitting writes', async () => {
  api.request.mockResolvedValueOnce(failure('service_unavailable', 503));
  renderManagement(<AuditPage />);
  await screen.findByText('Records could not be loaded.');
  const retry = screen.getAllByRole('button', { name: 'Try again' }).at(0);
  if (!retry) throw new Error('Missing retry action');
  await userEvent.click(retry);
  await screen.findByText('roles.update');
  expect(api.request).toHaveBeenCalledTimes(2);
});
