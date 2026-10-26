import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import type { AdminDetail, RoleListItem } from '../../../contracts/access';
import type { Me } from '../../../contracts/auth';
import { failure } from '../../../api/result';
import { createNavigationController } from '../../../components/shell/navigation/controller';
import { actor, adminContent, renderAdmin, roles, subject } from './support';

interface ApiCall {
  operation: string;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  idempotencyKey?: string;
  signal: AbortSignal;
}
const controls = vi.hoisted(() => ({
  session: vi.fn<() => Promise<Me>>(),
  request: vi.fn<(input: ApiCall) => Promise<ApiResult<unknown>>>(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  refresh: vi.fn<() => void>(),
  push: vi.fn<(href: string) => void>(),
  close: vi.fn<() => void>(),
  created: vi.fn<() => void>(),
  allowed: new Set<string>(),
  principal: null as Me | null,
  user: null as AdminDetail | null,
  roleRows: [] as RoleListItem[],
  navigation: null as ReturnType<typeof createNavigationController> | null,
}));
vi.mock('../../../server/require-session', () => ({ requireSession: controls.session }));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    principal: controls.principal,
    reportResult: controls.report,
    refresh: controls.refresh,
    can: (operation: string) => controls.allowed.has(operation),
  }),
}));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => ({
    adapter: controls.navigation?.adapter,
    push: (href: string) => {
      controls.navigation?.request({ href, kind: 'push' }, () => {
        controls.push(href);
        window.history.pushState(null, '', href);
      });
    },
  }),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(window.location.search),
  usePathname: () => window.location.pathname,
  useRouter: () => ({ refresh: controls.refresh }),
  notFound: () => {
    throw new Error('Not found');
  },
}));

function ok(data: unknown, status = 200): ApiResult<unknown> {
  return { ok: true, status, data, requestId: '' };
}
function defaultApi(input: ApiCall): Promise<ApiResult<unknown>> {
  if (input.operation === 'roles.list')
    return Promise.resolve(
      ok({ rows: controls.roleRows, total: controls.roleRows.length, page: 1, pageSize: 100 }),
    );
  if (input.operation === 'admins.get') return Promise.resolve(ok(controls.user));
  if (input.operation === 'admins.list')
    return Promise.resolve(ok({ rows: [subject], total: 1, page: 1, pageSize: 20 }));
  return Promise.resolve(failure('not_found', 404));
}
beforeEach(() => {
  controls.principal = actor;
  controls.user = structuredClone(subject);
  controls.roleRows = structuredClone(roles);
  controls.allowed = new Set([
    'admins.list',
    'admins.get',
    'admins.create',
    'admins.update',
    'admins.invite',
    'roles.list',
  ]);
  controls.navigation = createNavigationController('/dashboard/admins');
  window.history.replaceState(null, '', '/dashboard/admins');
  controls.request.mockImplementation(defaultApi);
});
afterEach(() => {
  cleanup();
  controls.navigation?.dispose();
  vi.resetAllMocks();
});

function mutations(operation: string) {
  return controls.request.mock.calls
    .filter(([input]) => input.operation === operation)
    .map(([input]) => input);
}
import AdminsRoute from '../../../app/(admin)/dashboard/admins/page';
import AdminDetailRoute from '../../../app/(admin)/dashboard/admins/[id]/page';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdminsListPage } from '../admins-list-page';

it('renders server data with Tillgate-style name, role, status and row actions', async () => {
  renderAdmin(<AdminsListPage />);
  expect(await screen.findByText(subject.email)).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Display name' })).toBeInTheDocument();
  expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getByText('Pending activation')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions: subject@example.test' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'View details' }));
  expect(controls.push).toHaveBeenCalledWith(
    '/dashboard/admins/10000000-0000-4000-8000-000000000002',
  );
});

it('keeps row details disabled when list permission does not include detail permission', async () => {
  controls.allowed.delete('admins.get');
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  await userEvent.click(screen.getByRole('button', { name: 'Actions: subject@example.test' }));
  expect(await screen.findByRole('menuitem', { name: 'View details' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  expect(controls.push).not.toHaveBeenCalled();
});

it('merges a rapid search and status filter without losing the pending query', async () => {
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), {
    target: { value: 'example' },
  });
  fireEvent.submit(screen.getByRole('search'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
    target: { value: 'disabled' },
  });
  await waitFor(() =>
    expect(mutations('admins.list').at(-1)?.query).toMatchObject({
      q: 'example',
      status: 'disabled',
      page: 1,
    }),
  );
  const last = controls.push.mock.calls.at(-1)?.[0];
  expect(new URL(last ?? '', 'https://example.test').searchParams.get('q')).toBe('example');
  expect(new URL(last ?? '', 'https://example.test').searchParams.get('status')).toBe('disabled');
});

it('restores search and filters when browser history traverses to an earlier query', async () => {
  window.history.replaceState(null, '', '/dashboard/admins?q=first&status=disabled');
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  window.history.replaceState(null, '', '/dashboard/admins?activation=activated');
  await act(async () => {
    window.dispatchEvent(new PopStateEvent('popstate'));
    await Promise.resolve();
  });
  expect(screen.getByRole('searchbox', { name: 'Search users' })).toHaveValue('');
  expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveValue('all');
  expect(screen.getByRole('combobox', { name: 'Filter by activation' })).toHaveValue('activated');
});

it('sends real activation and name sort choices and resets pagination', async () => {
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by activation' }), {
    target: { value: 'pending' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Display name' }));
  await waitFor(() =>
    expect(mutations('admins.list').at(-1)?.query).toMatchObject({
      activation: 'pending',
      sortBy: 'displayName',
      order: 'asc',
      page: 1,
    }),
  );
});

it('reads a new page size through the server query rather than slicing cached rows', async () => {
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '50' },
  });
  await waitFor(() =>
    expect(mutations('admins.list').at(-1)?.query).toMatchObject({ pageSize: 50, page: 1 }),
  );
});

it('offers an honest return to the first page when data changes put the current page out of range', async () => {
  window.history.replaceState(null, '', '/dashboard/admins?page=4');
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.list'
      ? Promise.resolve(ok({ rows: [], total: 1, page: 4, pageSize: 20 }))
      : defaultApi(input),
  );
  renderAdmin(<AdminsListPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'First page' }));
  expect(
    new URL(controls.push.mock.calls.at(-1)?.[0] ?? '', 'https://example.test').searchParams.get(
      'page',
    ),
  ).toBe('1');
});

it('requires both the create capability and its role reading dependency', async () => {
  controls.allowed.delete('roles.list');
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  expect(screen.getByRole('button', { name: 'Invite user' })).toBeDisabled();
  expect(
    screen.getByText('This action needs the role directory, which is unavailable.'),
  ).toBeInTheDocument();
});

it('does not infer security creation rights from list access', async () => {
  controls.allowed.delete('admins.create');
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  expect(screen.queryByRole('button', { name: 'Invite user' })).not.toBeInTheDocument();
});

it('can open and close an invitation dialog without replacing the page', async () => {
  renderAdmin(<AdminsListPage />);
  await screen.findByText(subject.email);
  fireEvent.click(screen.getByRole('button', { name: 'Invite user' }));
  expect(await screen.findByRole('dialog', { name: 'Invite administrator' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

it('shows a permission state instead of fake zero counts when list reading is unavailable', () => {
  controls.allowed.delete('admins.list');
  renderAdmin(<AdminsListPage />);
  expect(screen.getByText('You cannot read the users list.')).toBeInTheDocument();
  expect(screen.queryByText('0 users')).not.toBeInTheDocument();
  expect(mutations('admins.list')).toHaveLength(0);
});

it('renders safe list failures with a real retry action', async () => {
  let lists = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'admins.list') return defaultApi(input);
    lists += 1;
    return lists === 1
      ? Promise.resolve(failure('backend_unavailable', 503, { requestId: 'list-123' }))
      : defaultApi(input);
  });
  renderAdmin(<AdminsListPage />);
  expect(await screen.findByText(/list-123/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText(subject.email)).toBeInTheDocument();
});

it('renders the users list in Chinese', async () => {
  renderAdmin(<AdminsListPage />, 'zh');
  await screen.findByText(subject.email);
  expect(screen.getByRole('heading', { name: '用户管理' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '邀请用户' })).toBeInTheDocument();
});

it('server entries verify identity before producing protected list or detail UI', async () => {
  controls.session.mockResolvedValue(actor);
  const list = await AdminsRoute();
  expect(renderToStaticMarkup(adminContent(list))).toContain('Users');
  const detail = await AdminDetailRoute({ params: Promise.resolve({ id: subject.id }) });
  expect(renderToStaticMarkup(adminContent(detail))).toContain('Account details');
  expect(controls.session).toHaveBeenCalledTimes(2);
});

it('rejects invalid detail identifiers and unauthorized route renders', async () => {
  controls.session.mockResolvedValue(actor);
  await expect(AdminDetailRoute({ params: Promise.resolve({ id: 'not-a-uuid' }) })).rejects.toThrow(
    'Not found',
  );
  controls.session.mockRejectedValue(new Error('Redirect to /login'));
  await expect(AdminsRoute()).rejects.toThrow('Redirect to /login');
  await expect(AdminDetailRoute({ params: Promise.resolve({ id: subject.id }) })).rejects.toThrow(
    'Redirect to /login',
  );
});

it('regression: a failed users request must not report an empty successful list', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.list'
      ? Promise.resolve(failure('backend_unavailable', 503, { requestId: 'list-failed' }))
      : defaultApi(input),
  );
  renderAdmin(<AdminsListPage />);
  await screen.findByText(/list-failed/);
  expect(screen.queryByText('No users found')).not.toBeInTheDocument();
  expect(screen.queryByText('0 users')).not.toBeInTheDocument();
});
