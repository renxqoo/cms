import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
import { AdminDetailPage } from '../admin-detail-page';

async function detailView() {
  const view = renderAdmin(<AdminDetailPage id={subject.id} />);
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Role' })).toBeEnabled());
  return view;
}
function name(value: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), { target: { value } });
}
function role(value: string) {
  fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), { target: { value } });
}
function save() {
  fireEvent.submit(screen.getByRole('form', { name: 'Account details' }));
}

it('reads an actual account and displays its safe identity without inventing a delivery or password control', async () => {
  await detailView();
  expect(screen.getByRole('heading', { level: 1, name: 'Subject' })).toBeInTheDocument();
  expect(screen.getByText('subject@example.test')).toBeInTheDocument();
  expect(screen.getByText('No delivery recorded')).toBeInTheDocument();
  expect(screen.queryByLabelText(/Password/)).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Back to users' })).toHaveAttribute(
    'href',
    '/dashboard/admins',
  );
});

it('does not write an unchanged account and validates its display name', async () => {
  await detailView();
  save();
  expect(screen.getByText('User details have no changes.')).toBeInTheDocument();
  name('x'.repeat(65));
  save();
  expect(
    screen.getByText('Use no more than 64 characters for the display name.'),
  ).toBeInTheDocument();
  expect(mutations('admins.update')).toHaveLength(0);
});

it('edits only changed name fields and keeps an existing disabled role untouched', async () => {
  controls.roleRows = roles.map((item) => ({ ...item, status: 'disabled' }));
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(ok({ ...subject, displayName: 'New name', version: 8 }))
      : defaultApi(input),
  );
  await detailView();
  name('New name');
  save();
  expect(await screen.findByText('User details saved.')).toBeInTheDocument();
  expect(mutations('admins.update')[0]?.body).toEqual({ version: 7, displayName: 'New name' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('confirms role or status changes before sending them and explains session and link revocation', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(ok({ ...subject, roleId: roles[1]?.id, roleCode: 'reviewer', version: 8 }))
      : defaultApi(input),
  );
  await detailView();
  role(roles[1]?.id ?? '');
  save();
  expect(
    await screen.findByRole('dialog', { name: 'Confirm role or status change' }),
  ).toHaveTextContent('unused invitation and reset links');
  expect(mutations('admins.update')).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm changes' }));
  expect(
    await screen.findByText(/The role or status change revoked all sessions/),
  ).toBeInTheDocument();
  expect(mutations('admins.update')[0]?.body).toEqual({ version: 7, roleId: roles[1]?.id });
  expect(screen.getByRole('button', { name: 'Resend invitation' })).toBeInTheDocument();
});

it('cancels destructive confirmation without discarding the role draft', async () => {
  await detailView();
  role(roles[1]?.id ?? '');
  save();
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue(roles[1]?.id);
  expect(mutations('admins.update')).toHaveLength(0);
});

it('allows archived account name and role maintenance but exposes no unarchive or invitation', async () => {
  controls.user = { ...subject, status: 'archived' };
  await detailView();
  expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
  expect(screen.getByRole('textbox', { name: 'Display name' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Resend invitation' })).not.toBeInTheDocument();
});

it('locks own role and status but permits an own display-name update and refreshes the shared identity', async () => {
  controls.user = { ...subject, id: actor.id, email: actor.email };
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(ok({ ...controls.user, displayName: 'Own name', version: 8 }))
      : defaultApi(input),
  );
  renderAdmin(<AdminDetailPage id={actor.id} />);
  await screen.findByRole('form', { name: 'Account details' });
  expect(screen.getByRole('combobox', { name: 'Role' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Status' })).toBeDisabled();
  name('Own name');
  save();
  expect(await screen.findByText('User details saved.')).toBeInTheDocument();
  expect(mutations('admins.update')[0]?.body).toEqual({ version: 7, displayName: 'Own name' });
  expect(controls.refresh).toHaveBeenCalledOnce();
});

it('keeps a draft on a background refresh and submits its original version rather than silently overwriting', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(failure('version_conflict', 409))
      : defaultApi(input),
  );
  await detailView();
  name('My draft');
  controls.user = { ...subject, version: 8, displayName: 'Remote name' };
  fireEvent.click(screen.getByRole('button', { name: 'Refresh user' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh user' })).toBeEnabled());
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('My draft');
  save();
  await waitFor(() => expect(mutations('admins.update')).toHaveLength(1));
  expect(mutations('admins.update')[0]?.body).toEqual({ version: 7, displayName: 'My draft' });
});

it('regression: does not drop a pending role change when its directory becomes unavailable', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(ok({ ...subject, version: 8, displayName: 'New name' }))
      : defaultApi(input),
  );
  const rendered = await detailView();
  name('New name');
  role(roles[1]?.id ?? '');
  controls.allowed.delete('roles.list');
  rendered.rerender(adminContent(<AdminDetailPage id={subject.id} />));
  expect(screen.getByRole('combobox', { name: 'Role' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
  save();
  expect(mutations('admins.update')).toHaveLength(0);
  expect(screen.getByRole('combobox', { name: 'Role' })).toHaveValue(roles[1]?.id);
});

it('rereads version conflicts and requires an explicit choice before saving against the new version', async () => {
  let writes = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'admins.update') return defaultApi(input);
    writes += 1;
    return Promise.resolve(
      writes === 1
        ? failure('version_conflict', 409)
        : ok({ ...subject, displayName: 'Draft', version: 10 }),
    );
  });
  await detailView();
  name('Draft');
  save();
  expect(await screen.findByRole('button', { name: 'Read current user' })).toBeInTheDocument();
  controls.user = { ...subject, version: 9, displayName: 'Remote name' };
  fireEvent.click(screen.getByRole('button', { name: 'Read current user' }));
  expect(await screen.findByText('Current server version: 9')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Draft');
  fireEvent.click(screen.getByRole('button', { name: 'Continue with the current version' }));
  save();
  expect(await screen.findByText('User details saved.')).toBeInTheDocument();
  expect(mutations('admins.update')[1]?.body).toEqual({ version: 9, displayName: 'Draft' });
});

it('verifies an unknown name update through the detail read instead of blindly replaying it', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(failure('request_failed', 0, { uncertain: true }))
      : defaultApi(input),
  );
  await detailView();
  name('Unknown saved name');
  save();
  await screen.findByRole('button', { name: 'Read current user' });
  controls.user = { ...subject, version: 8, displayName: 'Unknown saved name' };
  fireEvent.click(screen.getByRole('button', { name: 'Read current user' }));
  expect(
    await screen.findByText('The current user matches the submitted changes.'),
  ).toBeInTheDocument();
  expect(mutations('admins.update')).toHaveLength(1);
});

it('preserves draft and lock if reconciliation cannot read the user', async () => {
  let reads = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'admins.update')
      return Promise.resolve(failure('version_conflict', 409));
    if (input.operation === 'admins.get') {
      reads += 1;
      if (reads > 1) return Promise.resolve(failure('backend_unavailable', 503));
    }
    return defaultApi(input);
  });
  await detailView();
  name('Keep draft');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Read current user' }));
  await waitFor(() => expect(controls.report).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue('Keep draft');
  expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'Continue with the current version' }),
  ).not.toBeInTheDocument();
});

it('reuses the same invitation intent after an unknown response and displays the actual receipt', async () => {
  let invites = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'admins.invite') return defaultApi(input);
    invites += 1;
    return Promise.resolve(
      invites === 1
        ? failure('request_failed', 0, { uncertain: true })
        : ok({
            adminId: subject.id,
            delivery: { id: '30000000-0000-4000-8000-000000000002', status: 'accepted' },
          }),
    );
  });
  await detailView();
  fireEvent.click(await screen.findByRole('button', { name: 'Resend invitation' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Verify or retry the same operation' }),
  );
  expect(await screen.findByText('Accepted by SMTP')).toBeInTheDocument();
  const attempts = mutations('admins.invite');
  expect(attempts).toHaveLength(2);
  expect(attempts[0]?.body).toEqual({});
  expect(attempts[0]?.idempotencyKey).toBe(attempts[1]?.idempotencyKey);
});

it('shows actual invitation rate-limit feedback and starts a new intent only after a completed invitation', async () => {
  let invites = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'admins.invite') return defaultApi(input);
    invites += 1;
    return Promise.resolve(
      invites === 1
        ? { ...failure('rate_limited', 429), retryAfterSeconds: 31 }
        : ok({
            adminId: subject.id,
            delivery: { id: '30000000-0000-4000-8000-000000000003', status: 'failed' },
          }),
    );
  });
  await detailView();
  fireEvent.click(await screen.findByRole('button', { name: 'Resend invitation' }));
  expect(await screen.findByText(/31/)).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Resend invitation' }));
  expect(await screen.findByText('Failed')).toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Resend invitation' }));
  await waitFor(() => expect(mutations('admins.invite')).toHaveLength(3));
  const attempts = mutations('admins.invite');
  expect(attempts[0]?.idempotencyKey).toBe(attempts[1]?.idempotencyKey);
  expect(attempts[1]?.idempotencyKey).not.toBe(attempts[2]?.idempotencyKey);
});

it('blocks duplicate detail writes and aborts a pending request on unmount', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update' ? new Promise(() => {}) : defaultApi(input),
  );
  const rendered = await detailView();
  name('Pending');
  save();
  save();
  expect(mutations('admins.update')).toHaveLength(1);
  rendered.unmount();
  expect(mutations('admins.update')[0]?.signal.aborted).toBe(true);
});

it('retains the draft read-only after reading permission is lost', async () => {
  const rendered = await detailView();
  name('Preserved after revoke');
  controls.allowed.delete('admins.get');
  controls.allowed.delete('admins.update');
  rendered.rerender(adminContent(<AdminDetailPage id={subject.id} />));
  expect(screen.getByRole('textbox', { name: 'Display name' })).toHaveValue(
    'Preserved after revoke',
  );
  expect(screen.getByRole('textbox', { name: 'Display name' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Save details' })).not.toBeInTheDocument();
});

it('shows safe failure feedback when no user can be read', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.get'
      ? Promise.resolve(failure('not_found', 404, { requestId: 'missing-user' }))
      : defaultApi(input),
  );
  renderAdmin(<AdminDetailPage id={subject.id} />);
  expect(await screen.findByText(/missing-user/)).toBeInTheDocument();
  expect(screen.queryByRole('form')).not.toBeInTheDocument();
});

it('regression: a verified unknown role update still explains that old invitations and sessions were revoked', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.update'
      ? Promise.resolve(failure('request_failed', 0, { uncertain: true }))
      : defaultApi(input),
  );
  await detailView();
  role(roles[1]?.id ?? '');
  save();
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm changes' }));
  await screen.findByRole('button', { name: 'Read current user' });
  controls.user = { ...subject, version: 8, roleId: roles[1]?.id ?? '', roleCode: 'reviewer' };
  fireEvent.click(screen.getByRole('button', { name: 'Read current user' }));
  await screen.findByText('The current user matches the submitted changes.');
  expect(screen.getByText(/The role or status change revoked all sessions/)).toBeInTheDocument();
});

it('regression: refreshing invitation delivery must replace the initial pending receipt with the real latest status', async () => {
  const deliveryId = '30000000-0000-4000-8000-000000000004';
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.invite'
      ? Promise.resolve(
          ok({ adminId: subject.id, delivery: { id: deliveryId, status: 'pending' } }),
        )
      : defaultApi(input),
  );
  await detailView();
  fireEvent.click(screen.getByRole('button', { name: 'Resend invitation' }));
  await screen.findByText('Pending');
  controls.user = {
    ...subject,
    invitationDelivery: {
      id: deliveryId,
      status: 'accepted',
      createdAt: '2026-10-26T01:00:00.000Z',
      finishedAt: '2026-10-26T01:00:01.000Z',
    },
  };
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh user' }));
  expect(await screen.findByText('Accepted by SMTP')).toBeInTheDocument();
});
