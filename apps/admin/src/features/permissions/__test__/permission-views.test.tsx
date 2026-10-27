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
import type { Collection } from '../../../contracts/content';
import { PermissionDialog } from '../permission-dialog';
import { PermissionDeleteDialog } from '../permission-delete-dialog';
import { PermissionsPage } from '../permissions-page';

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
  push: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  refresh: vi.fn<() => void>(),
  denied: new Set<string>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    can: (id: string) => !api.denied.has(id),
    reportResult: api.report,
    refresh: api.refresh,
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/permissions',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: api.push, replace: vi.fn<() => void>() }),
}));
const collection: Collection = {
  key: 'articles',
  label: 'Articles',
  schemaVersion: 1,
  mode: 'drafts',
  history: true,
  singleton: false,
  defaultLocale: 'en',
  locales: ['en'],
  dataSchema: { type: 'object' },
  fields: [],
  behaviorHash: 'hash',
  mappingFingerprint: 'mapping',
  upload: false,
  capabilities: {
    autosave: true,
    publication: true,
    schedules: true,
    history: true,
    trash: true,
    purge: true,
  },
};

beforeEach(() => {
  api.denied.clear();
  api.request.mockImplementation((input) => {
    if (input.operation === 'collections.list')
      return Promise.resolve(managementSuccess({ rows: [collection] }));
    if (input.operation === 'endpoints.list')
      return Promise.resolve(
        managementSuccess({
          rows: [managementEndpoint()],
          total: 1,
          page: input.query?.page ?? 1,
          pageSize: input.query?.pageSize ?? 100,
        }),
      );
    return Promise.resolve(
      managementSuccess({
        rows: [managementPermission()],
        total: 1,
        page: input.query?.page ?? 1,
        pageSize: input.query?.pageSize ?? 20,
      }),
    );
  });
});
afterEach(() => vi.resetAllMocks());

it('regression: a new collection permission can be created before collection read endpoints are bound', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(
    managementSuccess(managementPermission({ scopeKind: 'collection', collectionKey: 'articles' })),
  );
  renderManagement(
    <PermissionDialog
      permission={null}
      endpoints={[
        managementEndpoint({
          operationId: 'collections.get',
          scopeKind: 'collection',
          collectionKey: 'articles',
          binding: null,
        }),
      ]}
      collections={[]}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Permission code' }), {
    target: { value: 'articles:manage' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Manage articles' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scope' }), {
    target: { value: 'collection' },
  });
  expect(screen.getByRole('option', { name: 'articles (articles)' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'articles' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toMatchObject({
    scopeKind: 'collection',
    collectionKey: 'articles',
  });
});

it('creates a collection-scoped permission from real catalog choices and preserves code/scope after creation', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(
    managementSuccess(managementPermission({ scopeKind: 'collection', collectionKey: 'articles' })),
  );
  renderManagement(
    <PermissionDialog
      permission={null}
      endpoints={[]}
      collections={[collection]}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Permission code' }), {
    target: { value: 'articles:read' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Read articles' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scope' }), {
    target: { value: 'collection' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'articles' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: '  preserved  ' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    code: 'articles:read',
    name: 'Read articles',
    description: '  preserved  ',
    scopeKind: 'collection',
    collectionKey: 'articles',
  });
});

it('blocks disabling when the binding catalog is incomplete', () => {
  renderManagement(
    <PermissionDialog
      permission={managementPermission()}
      endpoints={null}
      collections={[]}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
  );
  expect(screen.getByRole('textbox', { name: 'Permission code' })).toHaveAttribute('readonly');
  expect(screen.getByRole('combobox', { name: 'Scope' })).toBeDisabled();
  expect(screen.getByRole('option', { name: 'Disabled' })).toBeDisabled();
  expect(
    screen.getByText('The binding catalog could not be read completely. Disabling is unavailable.'),
  ).toBeInTheDocument();
});

it('retains an existing collection key when no metadata choice is available and allows harmless metadata edits', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(managementSuccess(managementPermission({ name: 'Renamed' })));
  renderManagement(
    <PermissionDialog
      permission={managementPermission({ scopeKind: 'collection', collectionKey: 'retired' })}
      endpoints={null}
      collections={null}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Collection' })).toHaveValue('retired');
  expect(screen.getByRole('option', { name: 'retired' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Renamed' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual({ version: 3, name: 'Renamed' });
});

it('keeps new collection permissions disabled until their read dependency succeeds', () => {
  renderManagement(
    <PermissionDialog
      permission={null}
      endpoints={[]}
      collections={null}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
    'zh',
  );
  fireEvent.change(screen.getByRole('combobox', { name: '范围' }), {
    target: { value: 'collection' },
  });
  expect(screen.getByRole('button', { name: '保存' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: '所属集合' })).toBeDisabled();
});

it('keeps an uncertain creation locked and retries the same body and idempotency key', async () => {
  const saved = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(managementSuccess(managementPermission()));
  renderManagement(
    <PermissionDialog
      permission={null}
      endpoints={[]}
      collections={[]}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Permission code' }), {
    target: { value: 'content:read' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Read' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Retry the same creation' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual(api.request.mock.calls[1]?.[0].body);
  expect(api.request.mock.calls[0]?.[0].idempotencyKey).toBe(
    api.request.mock.calls[1]?.[0].idempotencyKey,
  );
});

it('does not rebase permission drafts on a conflict until the server snapshot is explicitly reviewed', async () => {
  api.request.mockResolvedValueOnce(failure('version_conflict', 409)).mockResolvedValueOnce(
    managementSuccess({
      rows: [managementPermission({ name: 'Server name', version: 9 })],
      total: 1,
      page: 1,
      pageSize: 100,
    }),
  );
  renderManagement(
    <PermissionDialog
      permission={managementPermission()}
      endpoints={[]}
      collections={[]}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Retained draft' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Retained draft');
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});

it('shows permission lists, opens edits, and keeps scope/status filters within their exact HTTP query keys', async () => {
  renderManagement(<PermissionsPage />);
  await screen.findByText('Read content');
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'disabled' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) => input.operation === 'permissions.list' && input.query?.status === 'disabled',
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Scope' }), {
    target: { value: 'collection' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'articles' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) =>
          input.operation === 'permissions.list' && input.query?.collectionKey === 'articles',
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
  expect(await screen.findByRole('dialog', { name: 'Edit permission' })).toBeInTheDocument();
});

it('deletes only after version review and never treats an in-use rejection as success', async () => {
  const deleted = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [managementPermission({ version: 12 })],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    )
    .mockResolvedValueOnce(failure('resource_in_use', 409));
  renderManagement(
    <PermissionDeleteDialog
      permission={managementPermission()}
      onClose={vi.fn<() => void>()}
      onDeleted={deleted}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Read current state' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Use this version and retain drafts' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(deleted).not.toHaveBeenCalled();
  expect(api.request.mock.calls[2]?.[0].query).toEqual({ version: 12 });
});

it('does not fetch a permission list when its read operation is absent', () => {
  api.denied.add('permissions.list');
  renderManagement(<PermissionsPage />);
  expect(screen.getByText('You do not have permission to read this resource.')).toBeInTheDocument();
  expect(api.request.mock.calls.some(([input]) => input.operation === 'permissions.list')).toBe(
    false,
  );
});

it('creates and deletes through page dialogs and reloads actual results after both confirmed writes', async () => {
  let value = managementPermission();
  let exists = false;
  api.request.mockImplementation((input) => {
    if (input.operation === 'collections.list')
      return Promise.resolve(managementSuccess({ rows: [collection] }));
    if (input.operation === 'endpoints.list')
      return Promise.resolve(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
    if (input.operation === 'permissions.create') {
      exists = true;
      value = managementPermission({ name: 'New permission', code: 'team:read', version: 8 });
      return Promise.resolve(managementSuccess(value));
    }
    if (input.operation === 'permissions.delete') {
      exists = false;
      return Promise.resolve(managementSuccess(undefined, 204));
    }
    return Promise.resolve(
      managementSuccess({
        rows: exists ? [value] : [],
        total: exists ? 1 : 0,
        page: 1,
        pageSize: 20,
      }),
    );
  });
  renderManagement(<PermissionsPage />);
  await userEvent.click(screen.getByRole('button', { name: 'Create permission' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create permission' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Permission code' }), {
    target: { value: 'team:read' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: 'New permission' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findByText('New permission');
  await userEvent.click(screen.getByRole('button', { name: 'Actions: New permission' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete permission' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => expect(screen.queryByText('New permission')).not.toBeInTheDocument());
  const write = api.request.mock.calls
    .map(([input]) => input)
    .find((input) => input.operation === 'permissions.delete');
  expect(write?.query).toEqual({ version: 8 });
  expect(write?.params).toEqual({ id: '22222222-2222-4222-8222-222222222222' });
});

it.each(['create', 'update'])(
  'regression: permission %s refreshes confirmed rows without fetching the unchanged endpoint catalog again',
  async (operation) => {
    let value = managementPermission();
    let exists = operation === 'update';
    api.request.mockImplementation((input) => {
      if (input.operation === 'collections.list')
        return Promise.resolve(managementSuccess({ rows: [collection] }));
      if (input.operation === 'endpoints.list')
        return Promise.resolve(
          managementSuccess({ rows: [managementEndpoint()], total: 1, page: 1, pageSize: 100 }),
        );
      if (input.operation === `permissions.${operation}`) {
        exists = true;
        value = managementPermission({ name: 'Confirmed permission', version: 4 });
        return Promise.resolve(managementSuccess(value));
      }
      return Promise.resolve(
        managementSuccess({
          rows: exists ? [value] : [],
          total: exists ? 1 : 0,
          page: 1,
          pageSize: 20,
        }),
      );
    });
    renderManagement(<PermissionsPage />);
    if (operation === 'create') {
      await userEvent.click(screen.getByRole('button', { name: 'Create permission' }));
      fireEvent.change(screen.getByRole('textbox', { name: 'Permission code' }), {
        target: { value: 'team:confirmed' },
      });
    } else {
      await screen.findByText('Read content');
      await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
    }
    const dialog = await screen.findByRole('dialog', {
      name: operation === 'create' ? 'Create permission' : 'Edit permission',
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Confirmed permission' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await screen.findByText('Confirmed permission');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
    ).toHaveLength(operation === 'create' ? 0 : 1);
  },
);

it.each(['denied', 'partial'])(
  'loads the complete endpoint fallback after choosing collection scope with %s collection visibility',
  async (visibility) => {
    if (visibility === 'denied') api.denied.add('collections.list');
    const original = api.request.getMockImplementation();
    const endpoints = Array.from({ length: 101 }, (_, index) =>
      managementEndpoint({
        operationId: 'collections.get',
        scopeKind: 'collection',
        collectionKey: index === 100 ? 'fallback' : `source_${index}`,
      }),
    );
    api.request.mockImplementation((input) => {
      if (input.operation === 'endpoints.list') {
        const page = Number(input.query?.page);
        return Promise.resolve(
          managementSuccess({
            rows: endpoints.slice((page - 1) * 100, page * 100),
            total: 101,
            page,
            pageSize: 100,
          }),
        );
      }
      if (input.operation === 'permissions.create')
        return Promise.resolve(
          managementSuccess(
            managementPermission({ scopeKind: 'collection', collectionKey: 'fallback' }),
          ),
        );
      if (!original) throw new Error('Missing fixture response');
      return original(input);
    });
    renderManagement(<PermissionsPage />);
    await screen.findByText('Read content');
    expect(
      api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
    ).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Create permission' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create permission' });
    expect(
      api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
    ).toHaveLength(0);
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Scope' }), {
      target: { value: 'collection' },
    });
    await within(dialog).findByRole('option', { name: 'fallback (fallback)' });
    expect(
      api.request.mock.calls
        .filter(([input]) => input.operation === 'endpoints.list')
        .map(([input]) => input.query?.page),
    ).toEqual([1, 2]);
    expect(within(dialog).queryByRole('option', { name: 'Articles (articles)' }) !== null).toBe(
      visibility === 'partial',
    );
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Collection' }), {
      target: { value: 'fallback' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Permission code' }), {
      target: { value: 'fallback:create' },
    });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Fallback creation' },
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(
      api.request.mock.calls.find(([input]) => input.operation === 'permissions.create')?.[0].body,
    ).toMatchObject({ collectionKey: 'fallback', scopeKind: 'collection' });
    expect(
      api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
    ).toHaveLength(2);
  },
);

it('blocks disabling after an endpoint catalog failure and retries the complete dependency catalog', async () => {
  const original = api.request.getMockImplementation();
  let unavailable = true;
  api.request.mockImplementation((input) => {
    if (input.operation === 'endpoints.list' && unavailable)
      return Promise.resolve(failure('temporarily_unavailable', 503));
    if (!original) throw new Error('Missing fixture response');
    return original(input);
  });
  renderManagement(<PermissionsPage />);
  await screen.findByText('Read content');
  expect(
    api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
  ).toHaveLength(0);
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit permission' });
  expect(within(dialog).getByRole('option', { name: 'Disabled' })).toBeDisabled();
  const retry = await within(dialog).findByRole('button', {
    name: 'Reload complete dependency catalogs',
  });
  unavailable = false;
  await userEvent.click(retry);
  await waitFor(() =>
    expect(within(dialog).getByRole('option', { name: 'Disabled' })).toBeEnabled(),
  );
  expect(
    api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
  ).toHaveLength(2);
});

it('cancels an unfinished dialog catalog read and starts a new complete read when reopened', async () => {
  const original = api.request.getMockImplementation();
  let pending: AbortSignal | undefined;
  api.request.mockImplementation((input) => {
    if (input.operation === 'endpoints.list' && !pending)
      return new Promise((resolve) => {
        pending = input.signal;
        input.signal.addEventListener('abort', () => resolve(failure('request_cancelled', 0)), {
          once: true,
        });
      });
    if (!original) throw new Error('Missing fixture response');
    return original(input);
  });
  renderManagement(<PermissionsPage />);
  await screen.findByText('Read content');
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
  await screen.findByRole('dialog', { name: 'Edit permission' });
  await waitFor(() => expect(pending).toBeDefined());
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(pending?.aborted).toBe(true));
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
  const reopened = await screen.findByRole('dialog', { name: 'Edit permission' });
  await waitFor(() =>
    expect(within(reopened).getByRole('option', { name: 'Disabled' })).toBeEnabled(),
  );
  expect(
    api.request.mock.calls.filter(([input]) => input.operation === 'endpoints.list'),
  ).toHaveLength(2);
});

it('allows closing untouched page dialogs without inventing a successful write', async () => {
  renderManagement(<PermissionsPage />);
  await screen.findByText('Read content');
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Edit permission' }));
  await screen.findByRole('dialog', { name: 'Edit permission' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Actions: Read content' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete permission' }));
  await screen.findByRole('dialog', { name: 'Delete permission: Read content' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(
    api.request.mock.calls.some(
      ([input]) =>
        input.operation === 'permissions.update' || input.operation === 'permissions.delete',
    ),
  ).toBe(false);
});

it('sends page search, sort and pagination changes through the allowed permission query', async () => {
  api.request.mockImplementation((input) => {
    if (input.operation === 'collections.list')
      return Promise.resolve(managementSuccess({ rows: [collection] }));
    if (input.operation === 'endpoints.list')
      return Promise.resolve(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
    const page = Number(input.query?.page ?? 1);
    const size = Number(input.query?.pageSize ?? 20);
    const all = Array.from({ length: 21 }, (_, index) =>
      managementPermission({
        id: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
        name: `Permission ${index}`,
        code: `team:read_${index}`,
      }),
    );
    return Promise.resolve(
      managementSuccess({
        rows: all.slice((page - 1) * size, page * size),
        total: 21,
        page,
        pageSize: size,
      }),
    );
  });
  renderManagement(<PermissionsPage />);
  await screen.findByText('Permission 0');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'Team' },
  });
  await userEvent.click(screen.getByRole('button', { name: /^Search$/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Permission code' }));
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) =>
          input.operation === 'permissions.list' &&
          input.query?.page === 2 &&
          input.query?.q === 'Team',
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
          input.operation === 'permissions.list' &&
          input.query?.pageSize === 10 &&
          input.query?.page === 1,
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: '' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scope' }), {
    target: { value: 'global' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([input]) =>
          input.operation === 'permissions.list' &&
          input.query?.scopeKind === 'global' &&
          !('collectionKey' in (input.query ?? {})),
      ),
    ).toBe(true),
  );
});

it('shows only readable data when security writes are absent and keeps existing disabled scopes selectable for display', async () => {
  api.denied.add('permissions.create');
  api.denied.add('permissions.update');
  api.denied.add('permissions.delete');
  renderManagement(<PermissionsPage />);
  await screen.findByText('Read content');
  expect(screen.queryByRole('button', { name: 'Create permission' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Actions: Read content' })).not.toBeInTheDocument();
});

it('saves a status change only after explicit risk confirmation and refreshes authorization', async () => {
  const saved = vi.fn<() => void>();
  api.request.mockResolvedValue(
    managementSuccess(managementPermission({ status: 'disabled', version: 4 })),
  );
  renderManagement(
    <PermissionDialog
      permission={managementPermission()}
      endpoints={[]}
      collections={[]}
      onClose={vi.fn<() => void>()}
      onSaved={saved}
    />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'disabled' },
  });
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await userEvent.click(
    screen.getByRole('checkbox', {
      name: 'I understand that disabling this permission denies requests using it, including management reads.',
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(api.request.mock.calls[0]?.[0].body).toEqual({ version: 3, status: 'disabled' });
  expect(api.refresh).toHaveBeenCalledOnce();
});

it('keeps invalid permission codes local instead of sending an invalid create', async () => {
  renderManagement(
    <PermissionDialog
      permission={null}
      endpoints={[]}
      collections={[]}
      onClose={vi.fn<() => void>()}
      onSaved={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Permission code' }), {
    target: { value: 'invalid' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Name' } });
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
});

it('regression: a failed conflict read never unlocks deletion with an unreviewed version', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(failure('forbidden', 403));
  renderManagement(
    <PermissionDeleteDialog
      permission={managementPermission()}
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
