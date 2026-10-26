import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  managementNavigation,
  managementPermission,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { flattenNavigation } from '../navigation-model';
import { NavigationDialog } from '../navigation-dialog';
import { NavigationDeleteDialog } from '../navigation-delete-dialog';
import { NavigationPage } from '../navigation-page';

interface Input {
  operation: string;
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
  signal: AbortSignal;
  idempotencyKey?: string;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: Input) => Promise<ApiResult<unknown>>>(),
  push: vi.fn<() => void>(),
  refresh: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  denied: new Set<string>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    can: (id: string) => !api.denied.has(id),
    refresh: api.refresh,
    reportResult: api.report,
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/navigation',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: api.push, replace: vi.fn<() => void>() }),
}));
const group = managementNavigation();
const page = managementNavigation({
  id: '77777777-7777-4777-8777-777777777777',
  type: 'page',
  name: 'Roles',
  parentId: group.id,
  path: '/dashboard/roles',
  visibility: 'authenticated',
});
beforeEach(() => {
  api.denied.clear();
  api.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'permissions.list'
        ? managementSuccess({ rows: [managementPermission()], total: 1, page: 1, pageSize: 100 })
        : managementSuccess({ rows: [{ ...group, children: [page] }] }),
    ),
  );
});
afterEach(() => vi.resetAllMocks());

it('creates a registered page with an exact parent, icon and explicit active permission', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(managementSuccess(page));
  renderManagement(
    <NavigationDialog
      node={null}
      nodes={flattenNavigation([group])}
      permissions={[managementPermission()]}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Role page' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'page' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Parent node' }), {
    target: { value: group.id },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Page path' }), {
    target: { value: '/dashboard/roles' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Icon' }), { target: { value: 'shield' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Visibility' }), {
    target: { value: 'permission' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Required permission' }), {
    target: { value: managementPermission().id },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Sort order' }), {
    target: { value: '5' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    parentId: group.id,
    type: 'page',
    name: 'Role page',
    path: '/dashboard/roles',
    icon: 'shield',
    sortOrder: 5,
    visibility: 'permission',
    permissionId: '22222222-2222-4222-8222-222222222222',
  });
});

it('creates an action without pretending it is a link or an API permission', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(managementSuccess(page));
  renderManagement(
    <NavigationDialog
      node={null}
      nodes={flattenNavigation([{ ...group, children: [page] }])}
      permissions={null}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Edit action' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'action' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Parent node' }), {
    target: { value: page.id },
  });
  expect(screen.queryByRole('combobox', { name: 'Page path' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Icon' })).not.toBeInTheDocument();
  expect(
    screen.getByText('Action nodes have no link and do not grant API permissions.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toMatchObject({
    type: 'action',
    path: null,
    icon: null,
    permissionId: null,
  });
});

it('keeps child-bearing types immutable and marks unregistered paths until they are corrected', () => {
  renderManagement(
    <NavigationDialog
      node={group}
      nodes={flattenNavigation([{ ...group, children: [page] }])}
      permissions={[]}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Type' })).toBeDisabled();
  expect(screen.getByText('A node with children cannot change its type.')).toBeInTheDocument();
});

it('retains a node draft on conflicts and adopts versions only after explicit review', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({ rows: [managementNavigation({ version: 10, name: 'Server node' })] }),
    )
    .mockResolvedValueOnce(
      managementSuccess(managementNavigation({ name: 'Draft node', version: 11 })),
    );
  const saved = vi.fn<() => void>();
  renderManagement(
    <NavigationDialog
      node={group}
      nodes={flattenNavigation([group])}
      permissions={[]}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Draft node' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'disabled' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Draft node');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[2]?.[0].body).toEqual({
    version: 10,
    name: 'Draft node',
    status: 'disabled',
  });
});

it('requires complete navigation dependencies and rejects stale disabled permission choices', () => {
  renderManagement(
    <NavigationDialog
      node={page}
      nodes={null}
      permissions={null}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
    'zh',
  );
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  expect(screen.getByText('需要读取完整导航目录和所选权限。')).toBeInTheDocument();
});

it('shows inherited disabled state and prevents deleting parents before their children', async () => {
  api.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'permissions.list'
        ? managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 })
        : managementSuccess({
            rows: [
              { ...group, status: 'disabled', children: [{ ...page, path: '/old-unregistered' }] },
            ],
          }),
    ),
  );
  renderManagement(<NavigationPage />);
  await screen.findByText('Management');
  expect(screen.getByText('Disabled ancestor')).toBeInTheDocument();
  expect(screen.getByText('Unregistered path')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Management' }));
  expect(await screen.findByRole('menuitem', { name: 'Delete node' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

it('creates and deletes through the page then refreshes real navigation state', async () => {
  let added = false;
  api.request.mockImplementation((input) => {
    if (input.operation === 'permissions.list')
      return Promise.resolve(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
    if (input.operation === 'navigation.create') {
      added = true;
      return Promise.resolve(managementSuccess(managementNavigation({ name: 'New group' })));
    }
    if (input.operation === 'navigation.delete') {
      added = false;
      return Promise.resolve(managementSuccess(undefined, 204));
    }
    return Promise.resolve(
      managementSuccess({ rows: added ? [managementNavigation({ name: 'New group' })] : [] }),
    );
  });
  renderManagement(<NavigationPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Create node' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create node' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: 'New group' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findByText('New group');
  await userEvent.click(screen.getByRole('button', { name: 'Actions: New group' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete node' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => expect(screen.queryByText('New group')).not.toBeInTheDocument());
  expect(api.refresh).toHaveBeenCalledTimes(2);
});

it('searches and paginates the fetched tree without adding unsupported API query keys', async () => {
  api.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'permissions.list'
        ? managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 })
        : managementSuccess({
            rows: Array.from({ length: 21 }, (_, index) =>
              managementNavigation({
                id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
                name: `Group ${index}`,
              }),
            ),
          }),
    ),
  );
  renderManagement(<NavigationPage />);
  await screen.findByText('Group 0');
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await screen.findByText('Group 20');
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'Group 2' },
  });
  await userEvent.click(screen.getByRole('button', { name: /^Search$/ }));
  await screen.findByText('Group 2');
  expect(screen.queryByText('Group 0')).not.toBeInTheDocument();
  expect(
    api.request.mock.calls.filter(([input]) => input.operation === 'navigation.list'),
  ).toHaveLength(1);
});

it('reconciles delete conflicts from the full tree and never reports a reference error as deletion', async () => {
  const deleted = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(managementSuccess({ rows: [managementNavigation({ version: 6 })] }))
    .mockResolvedValueOnce(failure('resource_in_use', 409));
  renderManagement(
    <NavigationDeleteDialog node={group} onClose={vi.fn<() => void>()} onDeleted={deleted} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(deleted).not.toHaveBeenCalled();
  expect(api.request.mock.calls[2]?.[0].query).toEqual({ version: 6 });
});

it('does not expose security writes or fetch a denied tree', () => {
  api.denied.add('navigation.list');
  api.denied.add('navigation.create');
  renderManagement(<NavigationPage />);
  expect(screen.getByText('You do not have permission to read navigation.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Create node' })).not.toBeInTheDocument();
  expect(api.request.mock.calls.some(([input]) => input.operation === 'navigation.list')).toBe(
    false,
  );
});

it('regression: a failed conflict read never unlocks deletion with an unreviewed version', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(failure('forbidden', 403));
  renderManagement(
    <NavigationDeleteDialog
      node={managementNavigation()}
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

it('regression: creating a group waits for the complete tree instead of treating loading as an empty catalog', async () => {
  api.request.mockImplementation((input) =>
    input.operation === 'navigation.list'
      ? new Promise(() => {})
      : Promise.resolve(managementSuccess({ rows: [], page: 1, pageSize: 100, total: 0 })),
  );
  renderManagement(<NavigationPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Create node' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Draft group' },
  });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(
    screen.getByText('The complete navigation tree and the selected permission must be available.'),
  ).toBeInTheDocument();
});

it('refreshes access after a full tree confirms an unknown deletion already removed the node', async () => {
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(managementSuccess({ rows: [] }));
  const deleted = vi.fn<() => void>();
  renderManagement(
    <NavigationDeleteDialog node={group} onClose={vi.fn<() => void>()} onDeleted={deleted} />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current state' }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(api.refresh).toHaveBeenCalledOnce();
});
