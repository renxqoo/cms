import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
import type { Binding, Endpoint, Permission } from '../../../contracts/access';
import { RecoveryEntry } from '../recovery-entry';
import { RecoveryPage } from '../recovery-page';
import { BindingDeleteDialog } from '../binding-delete-dialog';
import { PermissionDialog } from '../../permissions/permission-dialog';
import { recoveryPermissionSource } from '../recovery-read';

interface Input {
  operation: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  signal: AbortSignal;
  idempotencyKey?: string;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: Input) => Promise<ApiResult<unknown>>>(),
  refresh: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  denied: new Set<string>(),
  super: true,
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    principal: { role: { isSuper: api.super } },
    can: (id: string) => !api.denied.has(id),
    refresh: api.refresh,
    reportResult: api.report,
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/access-recovery',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));
const time = '2026-10-26T00:00:00.000Z';
function persistedBinding(overrides: Partial<Binding> = {}): Binding {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    version: 4,
    operationId: 'endpoints.list',
    scopeKind: 'global',
    collectionKey: null,
    permissionId: managementPermission().id,
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}
function page(resource: string, rows: unknown[], input: Input) {
  return managementSuccess({
    resource,
    rows,
    total: rows.length,
    page: Number(input.query?.page ?? 1),
    pageSize: Number(input.query?.pageSize ?? 100),
  });
}
function catalogs(
  input: Input,
  resources: { endpoints?: Endpoint[]; permissions?: Permission[]; bindings?: Binding[] } = {},
) {
  if (input.operation === 'collections.list') return managementSuccess({ rows: [] });
  if (input.operation !== 'access.readRecovery') return failure('forbidden', 403);
  const resource = input.query?.resource;
  if (resource === 'endpoints')
    return page(
      'endpoints',
      resources.endpoints ?? [managementEndpoint({ operationId: 'endpoints.list' })],
      input,
    );
  if (resource === 'permissions')
    return page('permissions', resources.permissions ?? [managementPermission()], input);
  return page('bindings', resources.bindings ?? [persistedBinding()], input);
}
beforeEach(() => {
  api.denied.clear();
  api.super = true;
  api.request.mockImplementation((input) => Promise.resolve(catalogs(input)));
});
afterEach(() => vi.resetAllMocks());
function mutations(operation: string) {
  return api.request.mock.calls
    .filter(([input]) => input.operation === operation)
    .map(([input]) => input);
}

it('requires a real ordinary 403 and does not use recovery for an ordinary service failure', async () => {
  api.request.mockResolvedValue(failure('service_unavailable', 503));
  renderManagement(<RecoveryPage />);
  await screen.findAllByRole('alert');
  expect(mutations('endpoints.list')).toHaveLength(1);
  expect(mutations('permissions.list')).toHaveLength(1);
  expect(mutations('access.readRecovery')).toHaveLength(0);
  expect(screen.queryByRole('heading', { name: 'Persistent bindings' })).not.toBeInTheDocument();
});

it('uses regular management links when both ordinary reads work even if the local operation snapshot omits them', async () => {
  api.denied.add('endpoints.list');
  api.denied.add('permissions.list');
  api.request.mockImplementation((input) =>
    Promise.resolve(
      managementSuccess({
        rows: [],
        total: 0,
        page: 1,
        pageSize: Number(input.query?.pageSize ?? 1),
      }),
    ),
  );
  renderManagement(<RecoveryPage />);
  await screen.findByText(
    'The endpoint and permission catalogs are readable. Use the regular management pages.',
  );
  expect(screen.getByRole('link', { name: 'Operation catalog' })).toHaveAttribute(
    'href',
    '/dashboard/endpoints',
  );
  expect(mutations('access.readRecovery')).toHaveLength(0);
});

it('does not trust a forged recovery operation on a non-super principal', () => {
  api.super = false;
  renderManagement(<RecoveryPage />, 'zh');
  expect(screen.getByText('当前账户没有独立安全恢复许可。')).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
});

it('creates a replacement permission and binding through existing security writes then verifies ordinary access', async () => {
  let permission: Permission | null = null;
  let binding: Binding | null = null;
  api.request.mockImplementation((input) => {
    if (input.operation === 'permissions.create') {
      permission = managementPermission({ code: 'recovery:read', name: 'Recovery read' });
      return Promise.resolve(managementSuccess(permission, 201));
    }
    if (input.operation === 'endpoints.createBinding') {
      binding = persistedBinding();
      return Promise.resolve(managementSuccess(binding, 201));
    }
    if (binding && (input.operation === 'endpoints.list' || input.operation === 'permissions.list'))
      return Promise.resolve(
        managementSuccess({
          rows:
            input.operation === 'endpoints.list'
              ? [managementEndpoint({ operationId: 'endpoints.list' })]
              : [permission],
          total: 1,
          page: 1,
          pageSize: 1,
        }),
      );
    return Promise.resolve(
      catalogs(input, {
        endpoints: [managementEndpoint({ operationId: 'endpoints.list', binding })],
        permissions: permission ? [permission] : [],
        bindings: binding ? [binding] : [],
      }),
    );
  });
  renderManagement(<RecoveryPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Create permission' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create permission' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Permission code' }), {
    target: { value: 'recovery:read' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Recovery read' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await screen.findByText('Recovery read');
  await userEvent.click(screen.getByRole('button', { name: 'Actions: endpoints.list Global' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Configure binding' }));
  fireEvent.change(await screen.findByRole('combobox', { name: 'Bound permission' }), {
    target: { value: managementPermission().id },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save binding' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mutations('permissions.create')[0]?.body).toEqual({
    code: 'recovery:read',
    name: 'Recovery read',
    description: null,
    scopeKind: 'global',
    collectionKey: null,
  });
  expect(mutations('endpoints.createBinding')[0]?.body).toEqual({
    operationId: 'endpoints.list',
    scopeKind: 'global',
    collectionKey: null,
    permissionId: managementPermission().id,
  });
  expect(mutations('permissions.create')[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  expect(mutations('endpoints.createBinding')[0]?.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
  await userEvent.click(screen.getByRole('button', { name: 'Check ordinary access again' }));
  await screen.findByText(
    'The endpoint and permission catalogs are readable. Use the regular management pages.',
  );
  expect(screen.queryByRole('heading', { name: 'Persistent bindings' })).not.toBeInTheDocument();
});

it('reenables a disabled read permission after a security conflict read using its reviewed version', async () => {
  const disabled = managementPermission({ status: 'disabled' });
  let version = 3;
  let writes = 0;
  api.request.mockImplementation((input) => {
    if (input.operation === 'permissions.update') {
      writes++;
      if (writes === 1) {
        version = 11;
        return Promise.resolve(failure('version_conflict', 409));
      }
      return Promise.resolve(managementSuccess({ ...disabled, status: 'active', version: 12 }));
    }
    return Promise.resolve(catalogs(input, { permissions: [{ ...disabled, version }] }));
  });
  renderManagement(<RecoveryPage />);
  await screen.findByRole('button', { name: 'Actions: Read content' });
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'active' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('active');
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mutations('permissions.update').map((input) => input.body)).toEqual([
    { version: 3, status: 'active' },
    { version: 11, status: 'active' },
  ]);
  expect(mutations('permissions.list')).toHaveLength(1);
});

it('deletes a persistent orphan binding only after reviewing a conflict through the bindings resource', async () => {
  let binding: Binding | null = persistedBinding({
    operationId: 'removed.operation',
    scopeKind: 'collection',
    collectionKey: 'retired',
  });
  let writes = 0;
  api.request.mockImplementation((input) => {
    if (input.operation === 'endpoints.deleteBinding') {
      writes++;
      if (writes === 1) {
        binding = persistedBinding({ ...binding, version: 9 });
        return Promise.resolve(failure('version_conflict', 409));
      }
      binding = null;
      return Promise.resolve(managementSuccess(undefined, 204));
    }
    return Promise.resolve(catalogs(input, { bindings: binding ? [binding] : [] }));
  });
  renderManagement(<RecoveryPage />);
  await screen.findByText('Operation removed');
  expect(screen.getAllByText('removed.operation')).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Remove binding' }));
  const dialog = await screen.findByRole('dialog', { name: 'Remove binding' });
  expect(within(dialog).queryByText('/v1/roles')).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm removal' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read current binding' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use the reviewed current binding' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mutations('endpoints.deleteBinding').map((input) => input.query)).toEqual([
    { version: 4 },
    { version: 9 },
  ]);
});

it('blocks mutations on incomplete recovery catalogs and retries them explicitly', async () => {
  let blocked = true;
  api.request.mockImplementation((input) =>
    Promise.resolve(
      input.operation === 'access.readRecovery' && input.query?.resource === 'bindings' && blocked
        ? failure('service_unavailable', 503)
        : catalogs(input),
    ),
  );
  renderManagement(<RecoveryPage />);
  await screen.findByText('Recovery catalogs could not be read completely.');
  expect(screen.getByRole('button', { name: 'Create permission' })).toBeDisabled();
  blocked = false;
  await userEvent.click(screen.getByRole('button', { name: 'Refresh recovery catalogs' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create permission' })).toBeEnabled(),
  );
});

it('allows explicit removal of ordinary read bindings now that independent recovery exists', async () => {
  api.request.mockResolvedValue(managementSuccess(undefined, 204));
  const deleted = vi.fn<() => void>();
  renderManagement(
    <BindingDeleteDialog
      endpoint={managementEndpoint({ operationId: 'endpoints.list' })}
      catalogReady
      onClose={vi.fn<() => void>()}
      onDeleted={deleted}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm removal' }));
  await waitFor(() => expect(deleted).toHaveBeenCalledOnce());
  expect(mutations('endpoints.deleteBinding')).toHaveLength(1);
});

it('keeps a recovery permission draft paused when catalog readiness is lost and offers an in-dialog retry', async () => {
  api.denied.add('permissions.list');
  const retry = vi.fn<() => void>();
  renderManagement(
    <PermissionDialog
      permission={managementPermission()}
      endpoints={null}
      collections={null}
      source={{ ...recoveryPermissionSource, ready: false }}
      onRetryDependencies={retry}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Retained draft' },
  });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('button', { name: 'Reload complete dependency catalogs' }),
  );
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Retained draft');
});

it('offers the registered recovery entry only after a denied ordinary read', () => {
  const view = renderManagement(<RecoveryEntry errors={[failure('service_unavailable', 503)]} />);
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  view.unmount();
  renderManagement(<RecoveryEntry errors={[failure('forbidden', 403)]} />);
  expect(screen.getByRole('link', { name: 'Access recovery' })).toHaveAttribute(
    'href',
    '/dashboard/access-recovery',
  );
});
