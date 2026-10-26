import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  managementPermission,
  managementRole,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { RolesPage } from '../roles-page';
import { RoleDetailPage } from '../role-detail';
import { RoleCreateDialog } from '../role-create-dialog';
import { RoleDeleteDialog } from '../role-delete-dialog';
import { PermissionPicker } from '../../permissions/permission-picker';

interface RequestInput {
  operation: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  signal: AbortSignal;
  idempotencyKey?: string;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: RequestInput) => Promise<ApiResult<unknown>>>(),
  push: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
  report: vi.fn<() => void>(),
  denied: new Set<string>(),
  phase: 'ready' as 'ready' | 'loading' | 'failed',
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: api.phase,
    principal: { roleId: 'super-role' },
    can: (id: string) => api.phase === 'ready' && !api.denied.has(id),
    refresh: api.refresh,
    reportResult: api.report,
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/roles',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: api.push, replace: vi.fn<() => void>() }),
}));

beforeEach(() => {
  api.denied.clear();
  api.phase = 'ready';
  api.request.mockImplementation((input) =>
    Promise.resolve().then(() => {
      if (input.operation === 'permissions.list')
        return managementSuccess({
          rows: [managementPermission()],
          total: 1,
          page: input.query?.page ?? 1,
          pageSize: input.query?.pageSize ?? 100,
        });
      if (input.operation === 'roles.get') return managementSuccess(managementRole());
      return managementSuccess({
        rows: [{ ...managementRole(), adminCount: 2, permissionCount: 1 }],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    }),
  );
});
afterEach(() => vi.resetAllMocks());

it('renders real role counts and opens the detail and delete actions without treating super as empty grants', async () => {
  api.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'permissions.list'
        ? managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 })
        : managementSuccess({
            rows: [
              { ...managementRole(), adminCount: 2, permissionCount: 1 },
              {
                ...managementRole({
                  id: '77777777-7777-4777-8777-777777777777',
                  code: 'super_admin',
                  name: 'Super role',
                  isSuper: true,
                }),
                adminCount: 1,
                permissionCount: 0,
              },
            ],
            total: 2,
            page: 1,
            pageSize: 20,
          }),
    ),
  );
  renderManagement(<RolesPage />);
  expect(await screen.findByText('Editorial team')).toBeInTheDocument();
  expect(screen.getByText('All permissions')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Editorial team' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  expect(
    await screen.findByRole('dialog', { name: 'Delete role: Editorial team' }),
  ).toBeInTheDocument();
});

it('keeps security write controls unavailable when the read-only operation set does not contain them', async () => {
  api.denied.add('roles.create');
  api.denied.add('roles.delete');
  renderManagement(<RolesPage />);
  expect(await screen.findByText('Editorial team')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create role' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Editorial team' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'View details' }));
  expect(api.push).toHaveBeenCalledWith(
    '/dashboard/roles/11111111-1111-4111-8111-111111111111',
    undefined,
  );
});

it('creates a role using a stable idempotency key across an uncertain retry and keeps the dialog locked', async () => {
  const created = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(managementSuccess(managementRole()));
  renderManagement(
    <RoleCreateDialog
      permissions={[managementPermission()]}
      onClose={vi.fn<() => void>()}
      onCreated={created}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Code' }), {
    target: { value: 'reviewers' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Reviewers' },
  });
  await userEvent.click(screen.getByRole('checkbox', { name: 'Read content (content:read)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Create role' }));
  const retry = await screen.findByRole('button', { name: 'Retry the same creation' });
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
  await userEvent.click(retry);
  await waitFor(() => expect(created).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    code: 'reviewers',
    name: 'Reviewers',
    description: null,
    permissionIds: ['22222222-2222-4222-8222-222222222222'],
  });
  expect(api.request.mock.calls[0]?.[0].idempotencyKey).toBe(
    api.request.mock.calls[1]?.[0].idempotencyKey,
  );
});

it('does not create a role before dependent permissions are available', () => {
  renderManagement(
    <RoleCreateDialog
      permissions={null}
      onClose={vi.fn<() => void>()}
      onCreated={vi.fn<() => void>()}
    />,
    'zh',
  );
  expect(screen.getByRole('button', { name: '创建角色' })).toBeDisabled();
  expect(screen.getByText('需要完整读取权限目录后才能分配授权。')).toBeInTheDocument();
});

it('preserves selected disabled or missing grants through searching and allows explicit removal', async () => {
  const change = vi.fn<(ids: string[]) => void>();
  renderManagement(
    <PermissionPicker
      permissions={[
        managementPermission(),
        managementPermission({
          id: '77777777-7777-4777-8777-777777777777',
          code: 'content:write',
          name: 'Disabled write',
          status: 'disabled',
        }),
      ]}
      value={['77777777-7777-4777-8777-777777777777', 'missing']}
      onChange={change}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Search permissions' }), {
    target: { value: 'Read' },
  });
  expect(
    screen.queryByRole('checkbox', { name: 'Disabled write (content:write)' }),
  ).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Unavailable permission: missing' }));
  expect(change).toHaveBeenCalledWith(['77777777-7777-4777-8777-777777777777']);
  fireEvent.change(screen.getByRole('textbox', { name: 'Search permissions' }), {
    target: { value: '' },
  });
  await userEvent.click(screen.getByRole('checkbox', { name: 'Disabled write (content:write)' }));
  expect(change).toHaveBeenCalledWith(['missing']);
});

it('shows both role edit areas and preserves a grant draft after saving metadata', async () => {
  api.request.mockImplementation((input) =>
    Promise.resolve().then(() => {
      if (input.operation === 'permissions.list')
        return managementSuccess({
          rows: [
            managementPermission(),
            managementPermission({
              id: '77777777-7777-4777-8777-777777777777',
              code: 'content:write',
              name: 'Write content',
            }),
          ],
          total: 2,
          page: 1,
          pageSize: 100,
        });
      if (input.operation === 'roles.update')
        return managementSuccess(managementRole({ name: 'Review team', version: 8 }));
      return managementSuccess(managementRole());
    }),
  );
  renderManagement(<RoleDetailPage id="11111111-1111-4111-8111-111111111111" />);
  expect(
    await screen.findByRole('heading', { name: 'Editorial team', level: 1 }),
  ).toBeInTheDocument();
  await userEvent.click(
    await screen.findByRole('checkbox', { name: 'Write content (content:write)' }),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Review team' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
  expect(await screen.findByText('Saved. Role details')).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Write content (content:write)' })).toBeChecked();
  expect(screen.getByRole('button', { name: 'Save permissions' })).toBeEnabled();
});

it('shows a current-server review after a conflict without overwriting dirty metadata', async () => {
  api.request.mockImplementation((input) =>
    Promise.resolve().then(() => {
      if (input.operation === 'permissions.list')
        return managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 });
      if (input.operation === 'roles.update') return failure('version_conflict', 409);
      return managementSuccess(managementRole({ permissionIds: [] }));
    }),
  );
  renderManagement(<RoleDetailPage id="11111111-1111-4111-8111-111111111111" />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), {
    target: { value: 'Retained draft' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Retained draft');
  expect(screen.getByRole('button', { name: 'Save details' })).toBeEnabled();
});

it('keeps super details read-only and forbids saving grants containing disabled selections', async () => {
  api.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'permissions.list'
        ? managementSuccess({
            rows: [managementPermission({ status: 'disabled' })],
            total: 1,
            page: 1,
            pageSize: 100,
          })
        : managementSuccess(managementRole({ isSuper: true })),
    ),
  );
  renderManagement(<RoleDetailPage id="11111111-1111-4111-8111-111111111111" />);
  expect(
    await screen.findByText(
      'Super administrator access is evaluated by the system. This role is read-only.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save details' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled();
});

it('uses the current server version only after explicit review of a delete conflict', async () => {
  const deleted = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(managementSuccess(managementRole({ version: 9 })))
    .mockResolvedValueOnce(managementSuccess(undefined, 204));
  renderManagement(
    <RoleDeleteDialog role={managementRole()} onClose={vi.fn<() => void>()} onDeleted={deleted} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[2]?.[0].query).toEqual({ version: 9 });
});

it('renders an explicit denial without fetching a protected role list', () => {
  api.denied.add('roles.list');
  renderManagement(<RolesPage />);
  expect(screen.getByText('You do not have permission to read this resource.')).toBeInTheDocument();
  expect(api.request.mock.calls.some(([input]) => input.operation === 'roles.list')).toBe(false);
});

it('creates from the list and reloads its rows without losing the result to a dirty-navigation guard', async () => {
  let created = false;
  api.request.mockImplementation((input) => {
    if (input.operation === 'permissions.list')
      return Promise.resolve(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
    if (input.operation === 'roles.create') {
      created = true;
      return Promise.resolve(
        managementSuccess(managementRole({ name: 'New reviewers', code: 'reviewers' })),
      );
    }
    return Promise.resolve(
      managementSuccess({
        rows: created
          ? [
              {
                ...managementRole({ name: 'New reviewers', code: 'reviewers' }),
                adminCount: 0,
                permissionCount: 0,
              },
            ]
          : [],
        total: created ? 1 : 0,
        page: 1,
        pageSize: 20,
      }),
    );
  });
  renderManagement(<RolesPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Create role' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create role' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Code' }), {
    target: { value: 'reviewers' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: 'New reviewers' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Create role' }));
  expect(await screen.findByText('New reviewers')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.push).not.toHaveBeenCalled();
});

it('keeps role list search, sort and pagination inside the actual allowed query contract', async () => {
  api.request.mockImplementation((input) => {
    if (input.operation === 'permissions.list')
      return Promise.resolve(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
    const page = Number(input.query?.page ?? 1);
    const size = Number(input.query?.pageSize ?? 20);
    const all = Array.from({ length: 21 }, (_, index) => ({
      ...managementRole({
        id: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`,
        name: `Role ${index}`,
        code: `role_${index}`,
      }),
      adminCount: 0,
      permissionCount: 0,
    }));
    return Promise.resolve(
      managementSuccess({
        rows: all.slice((page - 1) * size, page * size),
        total: 21,
        page,
        pageSize: size,
      }),
    );
  });
  renderManagement(<RolesPage />);
  await screen.findByText('Role 0');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'Editorial' },
  });
  await userEvent.click(screen.getByRole('button', { name: /^Search$/ }));
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) => input.operation === 'roles.list' && input.query?.q === 'Editorial',
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Name' }));
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) => input.operation === 'roles.list' && input.query?.sortBy === 'name',
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) => input.operation === 'roles.list' && input.query?.page === 2,
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) =>
          input.operation === 'roles.list' &&
          input.query?.pageSize === 10 &&
          input.query?.page === 1,
      ),
    ).toBe(true),
  );
});

it('edits every metadata field and explicitly removes a disabled permission before replacing grants', async () => {
  api.request.mockImplementation((input) => {
    if (input.operation === 'permissions.list')
      return Promise.resolve(
        managementSuccess({
          rows: [managementPermission({ status: 'disabled' })],
          total: 1,
          page: 1,
          pageSize: 100,
        }),
      );
    if (input.operation === 'roles.update')
      return Promise.resolve(
        managementSuccess(
          managementRole({
            name: 'Reviewers',
            description: 'Review decisions',
            status: 'disabled',
            version: 8,
          }),
        ),
      );
    if (input.operation === 'roles.replacePermissions')
      return Promise.resolve(
        managementSuccess(
          managementRole({
            name: 'Reviewers',
            description: 'Review decisions',
            status: 'disabled',
            permissionIds: [],
            version: 9,
          }),
        ),
      );
    return Promise.resolve(managementSuccess(managementRole()));
  });
  renderManagement(<RoleDetailPage id="11111111-1111-4111-8111-111111111111" />);
  fireEvent.change(await screen.findByRole('textbox', { name: 'Name' }), {
    target: { value: 'Reviewers' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: 'Review decisions' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'disabled' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
  await screen.findByText('Saved. Role details');
  expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Read content (content:read)' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save permissions' }));
  await screen.findByText('Saved. Role permissions');
  const writes = api.request.mock.calls
    .map(([input]) => input)
    .filter(
      (input) =>
        input.operation === 'roles.update' || input.operation === 'roles.replacePermissions',
    );
  expect(writes[0]?.body).toEqual({
    version: 7,
    name: 'Reviewers',
    description: 'Review decisions',
    status: 'disabled',
  });
  expect(writes[1]?.body).toEqual({ version: 8, permissionIds: [] });
});

it('preserves metadata editing while missing grant read dependencies disable only the grant area', async () => {
  api.denied.add('permissions.list');
  renderManagement(<RoleDetailPage id="11111111-1111-4111-8111-111111111111" />);
  await screen.findByRole('textbox', { name: 'Name' });
  expect(screen.getByRole('textbox', { name: 'Name' })).toBeEnabled();
  expect(
    screen.getByText('The complete permission catalog is required to assign grants.'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save permissions' })).toBeDisabled();
});

it('rejects reserved create codes locally and permits closing a known validation failure', async () => {
  const close = vi.fn<() => void>();
  renderManagement(
    <RoleCreateDialog permissions={[]} onClose={close} onCreated={vi.fn<() => void>()} />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Code' }), {
    target: { value: 'super_admin' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Blocked' } });
  await userEvent.click(screen.getByRole('button', { name: 'Create role' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
  await userEvent.keyboard('{Escape}');
  expect(close).toHaveBeenCalledOnce();
});

it('does not report a referenced role as deleted after the server rejects deletion', async () => {
  const deleted = vi.fn<() => void>();
  api.request.mockResolvedValue(failure('resource_in_use', 409));
  renderManagement(
    <RoleDeleteDialog role={managementRole()} onClose={vi.fn<() => void>()} onDeleted={deleted} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(deleted).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Read current state' })).not.toBeInTheDocument();
});

it('regression: a failed authorization snapshot has an actionable retry instead of an endless table spinner', () => {
  api.phase = 'failed';
  renderManagement(<RolesPage />);
  expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(api.refresh).toHaveBeenCalledOnce();
  expect(api.request).not.toHaveBeenCalled();
});

it('regression: a failed conflict read never unlocks deletion with an unreviewed version', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(failure('forbidden', 403));
  renderManagement(
    <RoleDeleteDialog
      role={managementRole()}
      onClose={vi.fn<() => void>()}
      onDeleted={vi.fn<() => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current state' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm delete' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Read current state' })).toBeEnabled();
});

it('regression: role code HTML pattern is valid under Unicode sets and accepts underscores and hyphens', () => {
  renderManagement(
    <RoleCreateDialog
      permissions={[]}
      onClose={vi.fn<() => void>()}
      onCreated={vi.fn<() => void>()}
    />,
  );
  const pattern = screen.getByRole('textbox', { name: 'Code' }).getAttribute('pattern');
  if (!pattern) throw new Error('Missing role code pattern');
  const expression = new RegExp(`^(?:${pattern})$`, 'v');
  expect(expression.test('editor_team-1')).toBe(true);
  expect(expression.test('1editor')).toBe(false);
  expect(expression.test('Editor')).toBe(false);
});
