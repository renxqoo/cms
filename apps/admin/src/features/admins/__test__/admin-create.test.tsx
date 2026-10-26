import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
import { AdminCreateDialog } from '../admin-create-dialog';
import { adminsMessages } from '../admins-messages';
import { useAdminCreate } from '../use-admin-create';

const createdAccount = {
  ...subject,
  id: '10000000-0000-4000-8000-000000000003',
  email: 'invitee@example.test',
  displayName: 'Invitee',
};
const receipt = {
  admin: createdAccount,
  delivery: { id: '30000000-0000-4000-8000-000000000001', status: 'pending' },
};

async function createView() {
  const view = renderAdmin(
    <AdminCreateDialog
      messages={adminsMessages.en}
      onClose={controls.close}
      onCreated={controls.created}
    />,
  );
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Role' })).toBeEnabled());
  return view;
}
function fill() {
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: '  Invitee@Example.Test  ' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Display name' }), {
    target: { value: 'Invitee' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
    target: { value: subject.roleId },
  });
}
function submit() {
  fireEvent.submit(screen.getByRole('form', { name: 'Invite administrator' }));
}

it('requires valid email, bounded name and a role from the current complete directory', async () => {
  await createView();
  submit();
  expect(
    screen.getByText('Enter a valid email with no more than 255 characters.'),
  ).toBeInTheDocument();
  expect(screen.getByText('Choose an available role from the directory.')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveFocus();
  expect(mutations('admins.create')).toHaveLength(0);
});

it('creates an invited account with normalized email and displays actual delivery rather than claiming inbox delivery', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.create' ? Promise.resolve(ok(receipt, 201)) : defaultApi(input),
  );
  await createView();
  fill();
  submit();
  expect(
    await screen.findByText(/Account created\. This is the actual invitation delivery status/),
  ).toBeInTheDocument();
  expect(screen.getByText('Pending')).toBeInTheDocument();
  expect(screen.getByText('invitee@example.test')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute(
    'href',
    '/dashboard/admins/10000000-0000-4000-8000-000000000003',
  );
  expect(mutations('admins.create')[0]).toMatchObject({
    body: { email: 'invitee@example.test', displayName: 'Invitee', roleId: subject.roleId },
  });
  expect(mutations('admins.create')[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(controls.created).toHaveBeenCalledOnce();
});

it('keeps an unknown create intent locked and retries the exact payload with the same idempotency key', async () => {
  let count = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'admins.create') return defaultApi(input);
    count += 1;
    return Promise.resolve(
      count === 1 ? failure('request_failed', 0, { uncertain: true }) : ok(receipt, 201),
    );
  });
  await createView();
  fill();
  submit();
  expect(await screen.findByText(/Inputs are locked/)).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Email' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await userEvent.keyboard('{Escape}');
  expect(controls.close).not.toHaveBeenCalled();
  submit();
  expect(mutations('admins.create')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Verify or retry the same operation' }));
  await waitFor(() => expect(controls.created).toHaveBeenCalledOnce());
  const attempts = mutations('admins.create');
  expect(attempts[0]?.idempotencyKey).toBe(attempts[1]?.idempotencyKey);
  expect(attempts[1]?.body).toEqual(attempts[0]?.body);
});

it('starts a new intent only after an explicit payload change following a known failure', async () => {
  let count = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'admins.create') return defaultApi(input);
    count += 1;
    return Promise.resolve(count === 1 ? failure('identifier_taken', 409) : ok(receipt, 201));
  });
  await createView();
  fill();
  submit();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create and invite' })).toBeEnabled(),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
    target: { value: 'different@example.test' },
  });
  submit();
  await waitFor(() => expect(controls.created).toHaveBeenCalledOnce());
  const attempts = mutations('admins.create');
  expect(attempts[0]?.idempotencyKey).not.toBe(attempts[1]?.idempotencyKey);
  expect(attempts[1]?.body).toMatchObject({ email: 'different@example.test' });
});

it('blocks duplicate requests, warns before unloading, and treats stopping as an unknown outcome', async () => {
  let resolve: ((result: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.create'
      ? new Promise((done) => {
          resolve = done;
        })
      : defaultApi(input),
  );
  await createView();
  fill();
  submit();
  submit();
  expect(mutations('admins.create')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Stop waiting' }));
  expect(mutations('admins.create')[0]?.signal.aborted).toBe(true);
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  await act(async () => {
    resolve?.(ok(receipt, 201));
    await Promise.resolve();
  });
  expect(controls.created).not.toHaveBeenCalled();
  expect(screen.getByText(/Inputs are locked/)).toBeInTheDocument();
});

it('aborts an in-flight creation when the page unmounts', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.create' ? new Promise(() => {}) : defaultApi(input),
  );
  const view = await createView();
  fill();
  submit();
  view.unmount();
  expect(mutations('admins.create')[0]?.signal.aborted).toBe(true);
});

it('disables submission when roles cannot be read and supports an explicit directory retry', async () => {
  let roleReads = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation !== 'roles.list') return defaultApi(input);
    roleReads += 1;
    return roleReads === 1
      ? Promise.resolve(failure('backend_unavailable', 503))
      : defaultApi(input);
  });
  renderAdmin(
    <AdminCreateDialog
      messages={adminsMessages.en}
      onClose={controls.close}
      onCreated={controls.created}
    />,
  );
  expect(await screen.findByRole('button', { name: 'Reload roles' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Create and invite' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reload roles' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Role' })).toBeEnabled());
  fill();
  expect(screen.getByRole('button', { name: 'Create and invite' })).toBeEnabled();
});

it('allows an ordinary cancellation without producing a request', async () => {
  await createView();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(controls.close).toHaveBeenCalledOnce();
  expect(mutations('admins.create')).toHaveLength(0);
});

it('regression: an unknown creation cannot retry after the role read permission is revoked and resumes the same intent after recovery', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'admins.create'
      ? Promise.resolve(failure('request_failed', 0, { uncertain: true }))
      : defaultApi(input),
  );
  const rendered = await createView();
  fill();
  submit();
  await screen.findByText(/Inputs are locked/);
  controls.allowed.delete('roles.list');
  const dialog = () =>
    adminContent(
      <AdminCreateDialog
        messages={adminsMessages.en}
        onClose={controls.close}
        onCreated={controls.created}
      />,
    );
  rendered.rerender(dialog());
  const retry = screen.getByRole('button', { name: 'Verify or retry the same operation' });
  expect(retry).toBeDisabled();
  fireEvent.click(retry);
  submit();
  expect(mutations('admins.create')).toHaveLength(1);
  expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('Invitee@Example.Test');
  controls.allowed.add('roles.list');
  rendered.rerender(dialog());
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await waitFor(() => expect(mutations('admins.create')).toHaveLength(2));
  const attempts = mutations('admins.create');
  expect(attempts[1]?.idempotencyKey).toBe(attempts[0]?.idempotencyKey);
  expect(attempts[1]?.body).toEqual(attempts[0]?.body);
});

it('regression: an unknown creation stays paused while its complete role directory fails to reload', async () => {
  let readFailed = false;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'admins.create')
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    if (input.operation === 'roles.list' && readFailed)
      return Promise.resolve(failure('backend_unavailable', 503));
    return defaultApi(input);
  });
  const rendered = await createView();
  fill();
  submit();
  await screen.findByText(/Inputs are locked/);
  const dialog = () =>
    adminContent(
      <AdminCreateDialog
        messages={adminsMessages.en}
        onClose={controls.close}
        onCreated={controls.created}
      />,
    );
  controls.allowed.delete('roles.list');
  rendered.rerender(dialog());
  readFailed = true;
  controls.allowed.add('roles.list');
  rendered.rerender(dialog());
  await screen.findByRole('button', { name: 'Reload roles' });
  const retry = screen.getByRole('button', { name: 'Verify or retry the same operation' });
  expect(retry).toBeDisabled();
  fireEvent.click(retry);
  expect(mutations('admins.create')).toHaveLength(1);
  readFailed = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reload roles' }));
  await waitFor(() => expect(retry).toBeEnabled());
  fireEvent.click(retry);
  await waitFor(() => expect(mutations('admins.create')).toHaveLength(2));
  const attempts = mutations('admins.create');
  expect(attempts[1]?.idempotencyKey).toBe(attempts[0]?.idempotencyKey);
  expect(attempts[1]?.body).toEqual(attempts[0]?.body);
});

function CreateIntent({ allowed, rows }: { allowed: boolean; rows: readonly RoleListItem[] }) {
  const flow = useAdminCreate({
    allowed,
    roles: rows,
    reportResult: controls.report,
    onCreated: controls.created,
  });
  return (
    <>
      <form aria-label="Create intent" onSubmit={(event) => void flow.submit(event)}>
        <input name="email" defaultValue="invitee@example.test" />
        <input name="displayName" defaultValue="Invitee" />
        <input name="roleId" defaultValue={subject.roleId} />
      </form>
      <button onClick={() => void flow.retry()}>Retry intent</button>
    </>
  );
}

it('regression: the create hook cannot replay an unknown intent without its current selected active role', async () => {
  controls.request.mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
  const rendered = renderAdmin(<CreateIntent allowed rows={roles} />);
  fireEvent.submit(screen.getByRole('form', { name: 'Create intent' }));
  await waitFor(() => expect(controls.report).toHaveBeenCalledOnce());
  rendered.rerender(adminContent(<CreateIntent allowed rows={[]} />));
  fireEvent.click(screen.getByRole('button', { name: 'Retry intent' }));
  expect(mutations('admins.create')).toHaveLength(1);
  rendered.rerender(adminContent(<CreateIntent allowed={false} rows={roles} />));
  fireEvent.click(screen.getByRole('button', { name: 'Retry intent' }));
  expect(mutations('admins.create')).toHaveLength(1);
  rendered.rerender(adminContent(<CreateIntent allowed rows={roles} />));
  fireEvent.click(screen.getByRole('button', { name: 'Retry intent' }));
  await waitFor(() => expect(controls.report).toHaveBeenCalledTimes(2));
  const attempts = mutations('admins.create');
  expect(attempts).toHaveLength(2);
  expect(attempts[1]?.idempotencyKey).toBe(attempts[0]?.idempotencyKey);
  expect(attempts[1]?.body).toEqual(attempts[0]?.body);
});
