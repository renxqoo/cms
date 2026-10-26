import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  managementEndpoint,
  managementPermission,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { BindingDialog } from '../binding-dialog';
import { BindingDeleteDialog } from '../binding-delete-dialog';
import { EndpointsPage } from '../endpoints-page';

interface Input {
  operation: string;
  body?: unknown;
  query?: Record<string, unknown>;
  signal: AbortSignal;
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
  usePathname: () => '/dashboard/endpoints',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: api.push, replace: vi.fn<() => void>() }),
}));
const permission = managementPermission({
  id: '88888888-8888-4888-8888-888888888888',
  name: 'New permission',
});
beforeEach(() => {
  api.denied.clear();
  api.request.mockImplementation((input) =>
    Promise.resolve(
      managementSuccess({
        rows:
          input.operation === 'permissions.list'
            ? [managementPermission(), permission]
            : [managementEndpoint()],
        page: 1,
        pageSize: Number(input.query?.pageSize ?? 100),
        total: 1,
      }),
    ),
  );
});
afterEach(() => vi.resetAllMocks());

it('only offers active permissions in the exact catalog scope and creates a binding', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(managementSuccess(managementEndpoint().binding));
  renderManagement(
    <BindingDialog
      endpoint={managementEndpoint({ binding: null })}
      permissions={[
        permission,
        managementPermission({ status: 'disabled' }),
        managementPermission({
          id: '99999999-9999-4999-8999-999999999999',
          scopeKind: 'collection',
          collectionKey: 'posts',
        }),
      ]}
      catalogReady
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  expect(screen.getAllByRole('option')).toHaveLength(2);
  fireEvent.change(screen.getByRole('combobox', { name: 'Bound permission' }), {
    target: { value: permission.id },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save binding' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toMatchObject({
    operationId: 'roles.list',
    permissionId: permission.id,
    collectionKey: null,
  });
});

it('retains a missing current grant visibly and prevents submission without complete dependencies', () => {
  renderManagement(
    <BindingDialog
      endpoint={managementEndpoint()}
      permissions={null}
      catalogReady={false}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
    'zh',
  );
  expect(screen.getByRole('option', { name: /不可用权限/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: '保存绑定' })).toBeDisabled();
  expect(
    screen.getByText('需要完整读取权限和端点目录，当前不能提交绑定变更。'),
  ).toBeInTheDocument();
});

it('does not blindly retry unknown updates and explicitly confirms a matching server binding', async () => {
  const saved = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [
          managementEndpoint({
            binding: {
              id: '33333333-3333-4333-8333-333333333333',
              version: 10,
              permissionId: permission.id,
            },
          }),
        ],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    );
  renderManagement(
    <BindingDialog
      endpoint={managementEndpoint()}
      permissions={[permission]}
      catalogReady
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Bound permission' }), {
    target: { value: permission.id },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save binding' }));
  expect(screen.getByRole('button', { name: 'Save binding' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm current result' }));
  expect(saved).toHaveBeenCalledOnce();
  expect(api.request).toHaveBeenCalledTimes(2);
});

it('adopts a changed binding base while retaining the selected permission after a conflict', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [managementEndpoint({ binding: null })],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(managementSuccess(managementEndpoint().binding));
  const saved = vi.fn<() => void>();
  renderManagement(
    <BindingDialog
      endpoint={managementEndpoint()}
      permissions={[permission]}
      catalogReady
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Bound permission' }), {
    target: { value: permission.id },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save binding' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use the reviewed current binding' }),
  );
  expect(screen.getByRole('combobox', { name: 'Bound permission' })).toHaveValue(permission.id);
  await userEvent.click(screen.getByRole('button', { name: 'Save binding' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[2]?.[0].operation).toBe('endpoints.createBinding');
});

it('refuses deletion while its catalog is incomplete', () => {
  renderManagement(
    <BindingDeleteDialog
      endpoint={managementEndpoint({ operationId: 'endpoints.list' })}
      catalogReady={false}
      onClose={vi.fn<() => void>()}
      onDeleted={vi.fn<() => void>()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
  expect(
    screen.getByText(
      'Complete permission and endpoint catalogs are required before changing bindings.',
    ),
  ).toBeInTheDocument();
});

it('reconciles binding deletion conflicts and uses the newly reviewed version', async () => {
  const deleted = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [
          managementEndpoint({
            binding: {
              id: '33333333-3333-4333-8333-333333333333',
              permissionId: permission.id,
              version: 14,
            },
          }),
        ],
        page: 1,
        pageSize: 100,
        total: 1,
      }),
    )
    .mockResolvedValueOnce(managementSuccess(undefined, 204));
  renderManagement(
    <BindingDeleteDialog
      endpoint={managementEndpoint()}
      catalogReady
      onClose={vi.fn<() => void>()}
      onDeleted={deleted}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use the reviewed current binding' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[2]?.[0].query).toEqual({ version: 14 });
});

it('confirms unknown deletion only after reading absence and exposes failures without false success', async () => {
  const deleted = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(failure('forbidden', 403))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [managementEndpoint({ binding: null })],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    );
  renderManagement(
    <BindingDeleteDialog
      endpoint={managementEndpoint()}
      catalogReady
      onClose={vi.fn<() => void>()}
      onDeleted={deleted}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  expect(deleted).not.toHaveBeenCalled();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
});

it('renders the real read-only catalog, filters supported keys, and edits through actions', async () => {
  api.request.mockImplementation((input) => {
    if (input.operation === 'endpoints.updateBinding')
      return Promise.resolve(managementSuccess(managementEndpoint().binding));
    const rows =
      input.operation === 'permissions.list'
        ? [managementPermission(), permission]
        : [
            managementEndpoint(),
            managementEndpoint({
              operationId: 'auth.me',
              bindingConfigurable: false,
              binding: null,
              accessKind: 'authenticated',
            }),
          ];
    return Promise.resolve(
      managementSuccess({
        rows,
        total: rows.length,
        page: 1,
        pageSize: Number(input.query?.pageSize ?? 100),
      }),
    );
  });
  renderManagement(<EndpointsPage />);
  await screen.findByText('auth.me');
  expect(screen.queryByRole('button', { name: /Create endpoint/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Actions: roles.list Global' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Configure binding' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Bound permission' }), {
    target: { value: permission.id },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save binding' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.change(screen.getByRole('textbox', { name: 'Module' }), {
    target: { value: 'access' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Access' }), {
    target: { value: 'permission' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filters' }));
  await waitFor(() =>
    expect(api.push).toHaveBeenCalledWith(
      '/dashboard/endpoints?page=1&pageSize=20&module=access&accessKind=permission',
      { scroll: false },
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() =>
    expect(api.push).toHaveBeenCalledWith('/dashboard/endpoints?page=1&pageSize=20', {
      scroll: false,
    }),
  );
});

it('does not start catalog reads or expose writes after read permission is absent', () => {
  api.denied.add('endpoints.list');
  renderManagement(<EndpointsPage />);
  expect(
    screen.getByText('You do not have permission to read the endpoint catalog.'),
  ).toBeInTheDocument();
  expect(api.request.mock.calls.some(([input]) => input.operation === 'endpoints.list')).toBe(
    false,
  );
});

it('regression: another current-state read removes the previous review action until the new response arrives', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({ rows: [managementEndpoint()], page: 1, pageSize: 100, total: 1 }),
    )
    .mockImplementationOnce(() => new Promise(() => {}));
  renderManagement(
    <BindingDeleteDialog
      endpoint={managementEndpoint()}
      catalogReady
      onClose={vi.fn<() => void>()}
      onDeleted={vi.fn<() => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  expect(
    await screen.findByRole('button', { name: 'Use the reviewed current binding' }),
  ).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  expect(
    screen.queryByRole('button', { name: 'Use the reviewed current binding' }),
  ).not.toBeInTheDocument();
});

it('regression: a missing operation catalog row does not confirm that its persistent binding was deleted', async () => {
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
  const deleted = vi.fn<() => void>();
  renderManagement(
    <BindingDeleteDialog
      endpoint={managementEndpoint()}
      catalogReady
      onClose={vi.fn<() => void>()}
      onDeleted={deleted}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  expect(deleted).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Confirm removal' })).toBeDisabled();
});
