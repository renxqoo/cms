import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import type { AllowedOperation, Me, VisibleNavigation } from '../../../contracts/auth';
import type { Collection } from '../../../contracts/content';
import type { ApiResult } from '../../../api/client';
import { failure } from '../../../api/result';
import { AdminShell } from '../admin-shell';
import { Dashboard } from '../dashboard';
import { useSessionActions } from '../session-actions';
import { sessionMessages } from '../session-messages';
import { useAccessControl } from '../../access-control/provider';

const mocks = vi.hoisted(() => ({
  request: vi.fn<(input: { signal: AbortSignal }) => Promise<ApiResult<undefined>>>(),
  replace: vi.fn<() => void>(),
  recovery: false,
  configured: false,
  operations: [] as AllowedOperation[],
  navigation: [] as VisibleNavigation[],
  pathname: '/dashboard',
  catalog: vi.fn<(input: { signal: AbortSignal }) => Promise<ApiResult<{ rows: Collection[] }>>>(),
}));
vi.mock('../../../api/client', () => ({
  requestApi: (input: { operation: string; signal: AbortSignal }) => {
    if (input.operation === 'access.myOperations')
      return Promise.resolve({
        ok: true,
        status: 200,
        requestId: '',
        data: {
          rows: mocks.recovery
            ? [{ operationId: 'access.readRecovery', scopeKind: 'global', collectionKey: null }]
            : mocks.operations,
          total: mocks.recovery ? 1 : mocks.operations.length,
          page: 1,
          pageSize: 100,
        },
      });
    if (input.operation === 'access.myNavigation')
      return Promise.resolve({
        ok: true,
        status: 200,
        requestId: '',
        data: {
          rows: mocks.configured
            ? [
                {
                  id: 'group',
                  type: 'group',
                  name: 'Team',
                  path: null,
                  icon: null,
                  children: [
                    {
                      id: 'roles',
                      type: 'page',
                      name: 'Roles',
                      path: '/dashboard/roles',
                      icon: null,
                      children: [],
                    },
                  ],
                },
              ]
            : mocks.navigation,
        },
      });
    if (input.operation === 'collections.list') return mocks.catalog(input);
    return mocks.request(input);
  },
}));
vi.mock('../session-navigation', () => ({ replaceAfterSignOut: mocks.replace }));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));

const principal: Me = {
  id: '1e2bc49f-9f00-4c24-b090-d38adfc231f6',
  version: 1,
  email: 'owner@example.test',
  displayName: 'Account owner',
  roleId: 'c5f7ad61-48c7-4885-823a-e7cf7c36a7d6',
  roleCode: 'super_admin',
  status: 'active',
  activation: 'activated',
  createdAt: '2026-10-25T00:00:00.000Z',
  updatedAt: '2026-10-25T00:00:00.000Z',
  lastLoginAt: null,
  role: {
    id: 'c5f7ad61-48c7-4885-823a-e7cf7c36a7d6',
    code: 'super_admin',
    name: 'Super admin',
    status: 'active',
    isSuper: true,
  },
};

function view(locale: 'zh' | 'en' = 'en', value = principal) {
  return render(
    <ShellProvider initial={parsePreferences({ locale })}>
      <AdminShell principal={value}>
        <Dashboard principal={value} />
      </AdminShell>
    </ShellProvider>,
  );
}

async function signOut() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Sign out' }));
}

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  mocks.recovery = false;
  mocks.configured = false;
  mocks.operations = [];
  mocks.navigation = [];
  mocks.pathname = '/dashboard';
});

it('regression: a configured menu still leaves security recovery reachable from the account menu', async () => {
  mocks.recovery = true;
  mocks.configured = true;
  view();
  await screen.findByRole('link', { name: 'Roles' });
  expect(screen.queryByRole('link', { name: 'Access recovery' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  expect(await screen.findByRole('menuitem', { name: 'Access recovery' })).toHaveAttribute(
    'href',
    '/dashboard/access-recovery',
  );
});

it.each([false, true])(
  'requires both a super role and security permission for the account recovery entry (%s)',
  async (hasPermission) => {
    mocks.recovery = hasPermission;
    view(
      'en',
      hasPermission ? { ...principal, role: { ...principal.role, isSuper: false } } : principal,
    );
    await waitFor(() => expect(screen.queryByText('Checking access…')).not.toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByRole('menuitem', { name: 'Access recovery' })).not.toBeInTheDocument();
  },
);

function collection(key: string, label: string): Collection {
  return {
    key,
    label,
    schemaVersion: 1,
    mode: 'direct',
    history: false,
    singleton: key === 'settings',
    defaultLocale: 'en',
    locales: ['en'],
    dataSchema: {},
    fields: [],
    behaviorHash: 'behavior',
    mappingFingerprint: 'mapping',
    upload: false,
    capabilities: {
      autosave: false,
      publication: false,
      schedules: false,
      history: false,
      trash: true,
      purge: true,
    },
  };
}

function allowCollections() {
  const rows = [
    collection('articles', 'Editorial articles'),
    collection('settings', 'Site settings'),
  ];
  mocks.operations = [
    { operationId: 'collections.list', scopeKind: 'global', collectionKey: null },
    ...rows.map((row) => ({
      operationId: 'collections.get',
      scopeKind: 'collection' as const,
      collectionKey: row.key,
    })),
  ];
  mocks.catalog.mockResolvedValue({ ok: true, status: 200, requestId: '', data: { rows } });
  return rows;
}

function configuredCollections() {
  mocks.navigation = [
    {
      id: 'content',
      type: 'group',
      name: 'Content management',
      path: null,
      icon: null,
      children: [
        {
          id: 'catalog',
          type: 'page',
          name: 'Content collections',
          path: '/dashboard/collections',
          icon: 'collections',
          children: [],
        },
        {
          id: 'resources',
          type: 'page',
          name: 'Shared resources',
          path: '/dashboard/resources',
          icon: 'resources',
          children: [],
        },
        {
          id: 'article',
          type: 'page',
          name: 'Duplicate articles',
          path: '/dashboard/collections/articles',
          icon: null,
          children: [],
        },
      ],
    },
  ];
}

it('shows an independent collection menu with real labels and direct singleton and list destinations', async () => {
  const media = window.matchMedia('(min-width: 768px)');
  vi.spyOn(window, 'matchMedia').mockReturnValue(Object.assign(media, { matches: true }));
  allowCollections();
  configuredCollections();
  view();
  const articles = await screen.findByRole('link', { name: 'Editorial articles' });
  expect(articles).toHaveAttribute('href', '/dashboard/collections/articles');
  expect(screen.getByRole('link', { name: 'Site settings' })).toHaveAttribute(
    'href',
    '/dashboard/collections/settings',
  );
  expect(articles.closest('section')).not.toBe(
    screen.getByRole('link', { name: 'Shared resources' }).closest('section'),
  );
  expect(screen.queryByRole('link', { name: 'Duplicate articles' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Content collections' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Collapse Content collections' }));
  expect(screen.queryByRole('link', { name: 'Editorial articles' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Expand Content collections' }));
  expect(screen.getByRole('link', { name: 'Editorial articles' })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));
  expect(screen.getByRole('link', { name: 'Editorial articles' })).toHaveAttribute(
    'title',
    'Editorial articles',
  );
});

it('regression: promoting collections preserves every other application menu', async () => {
  allowCollections();
  mocks.operations.push(
    ...[
      'admins.list',
      'roles.list',
      'permissions.list',
      'navigation.list',
      'endpoints.list',
      'access.readRecovery',
      'audit.list',
      'resources.list',
      'assets.listCleanup',
    ].map((operationId) => ({ operationId, scopeKind: 'global' as const, collectionKey: null })),
  );
  view();
  const sidebar = within(screen.getByRole('complementary', { name: 'Navigation menu' }));
  await sidebar.findByRole('link', { name: 'Editorial articles' });
  for (const [label, href] of [
    ['Users', '/dashboard/admins'],
    ['Roles', '/dashboard/roles'],
    ['Permissions', '/dashboard/permissions'],
    ['Navigation', '/dashboard/navigation'],
    ['Endpoints', '/dashboard/endpoints'],
    ['Access recovery', '/dashboard/access-recovery'],
    ['Audit logs', '/dashboard/audit-logs'],
    ['Resources', '/dashboard/resources'],
    ['Jobs', '/dashboard/jobs'],
    ['Asset cleanups', '/dashboard/asset-cleanups'],
  ] as const)
    expect(sidebar.getByRole('link', { name: label })).toHaveAttribute('href', href);
  expect(sidebar.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
  expect(sidebar.getByRole('link', { name: 'Account settings' })).toHaveAttribute(
    'href',
    '/dashboard/account',
  );
});

it.each(['', '/new', '/structure', '/11111111-1111-4111-8111-111111111111'])(
  'keeps the collection highlighted and provides collection breadcrumbs at %s',
  async (suffix) => {
    allowCollections();
    mocks.pathname = `/dashboard/collections/articles${suffix}`;
    view();
    const sidebar = within(screen.getByRole('complementary', { name: 'Navigation menu' }));
    expect(await sidebar.findByRole('link', { name: 'Editorial articles' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(sidebar.getByRole('link', { name: 'Site settings' })).not.toHaveAttribute(
      'aria-current',
    );
    const breadcrumbs = within(screen.getByRole('navigation', { name: 'Page path' }));
    expect(breadcrumbs.getByRole('link', { name: 'Collections' })).toHaveAttribute(
      'href',
      '/dashboard/collections',
    );
    expect(await breadcrumbs.findByText('Editorial articles')).toBeInTheDocument();
    expect(
      breadcrumbs.queryByRole('link', { name: 'Editorial articles' })?.getAttribute('href') ?? null,
    ).toBe(suffix ? '/dashboard/collections/articles' : null);
  },
);

it('does not add a collection menu when a configured navigation omits its catalog entry', async () => {
  allowCollections();
  configuredCollections();
  const [group] = mocks.navigation;
  if (!group) throw new Error('Expected configured navigation.');
  group.children = group.children.filter((page) => page.id === 'resources');
  view();
  await screen.findByRole('link', { name: 'Shared resources' });
  expect(mocks.catalog).not.toHaveBeenCalled();
  expect(screen.queryByRole('link', { name: 'Editorial articles' })).not.toBeInTheDocument();
});

it('does not show catalog rows whose collection read permission is absent', async () => {
  allowCollections();
  mocks.operations = mocks.operations.filter((operation) => operation.collectionKey !== 'settings');
  view();
  await screen.findByRole('link', { name: 'Editorial articles' });
  expect(screen.queryByRole('link', { name: 'Site settings' })).not.toBeInTheDocument();
});

it('keeps a configured catalog recovery entry without requesting a denied catalog', async () => {
  configuredCollections();
  view();
  await screen.findByText('Your account lacks the required read permission.');
  expect(screen.getByRole('link', { name: 'Collections overview' })).toHaveAttribute(
    'href',
    '/dashboard/collections',
  );
  expect(mocks.catalog).not.toHaveBeenCalled();
});

it.each([
  ['loading', 'Loading content…'],
  ['empty', 'No accessible collections'],
  ['failed', 'Could not load content'],
])('keeps a real overview recovery link for a %s collection catalog', async (phase, message) => {
  allowCollections();
  if (phase === 'loading') mocks.catalog.mockImplementation(() => new Promise(() => {}));
  if (phase === 'empty')
    mocks.catalog.mockResolvedValue({ ok: true, status: 200, requestId: '', data: { rows: [] } });
  if (phase === 'failed') mocks.catalog.mockResolvedValue(failure('temporarily_unavailable', 503));
  view();
  await screen.findByText(message);
  expect(screen.getByRole('link', { name: 'Collections overview' })).toHaveAttribute(
    'href',
    '/dashboard/collections',
  );
  expect(screen.queryByRole('link', { name: 'Editorial articles' })).not.toBeInTheDocument();
  expect(screen.queryAllByText('No accessible collections')).toHaveLength(
    phase === 'empty' ? 1 : 0,
  );
});

function RefreshAccess() {
  const access = useAccessControl();
  return <button onClick={access.refresh}>Refresh access</button>;
}

it('regression: permission refresh removes stale collection links and rejects a cancelled late catalog', async () => {
  allowCollections();
  const component = render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <AdminShell principal={principal}>
        <RefreshAccess />
      </AdminShell>
    </ShellProvider>,
  );
  await screen.findByRole('link', { name: 'Editorial articles' });
  let finish: ((value: ApiResult<{ rows: Collection[] }>) => void) | undefined;
  mocks.catalog.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  mocks.operations = mocks.operations.filter((operation) => operation.collectionKey !== 'settings');
  await userEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
  await screen.findByText('Loading content…');
  expect(screen.queryByRole('link', { name: 'Editorial articles' })).not.toBeInTheDocument();
  const signal = mocks.catalog.mock.calls.at(-1)?.[0].signal;
  mocks.operations = [];
  await userEvent.click(screen.getByRole('button', { name: 'Refresh access' }));
  await waitFor(() => expect(signal?.aborted).toBe(true));
  await act(async () => {
    finish?.({
      ok: true,
      status: 200,
      requestId: '',
      data: { rows: [collection('articles', 'Late private collection')] },
    });
    await Promise.resolve();
  });
  expect(screen.queryByRole('link', { name: 'Late private collection' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Collapse Collections' })).not.toBeInTheDocument();
  component.unmount();
});

it.each(['zh', 'en'] as const)(
  'shows only the verified principal in the shared %s production shell',
  async (locale) => {
    view(locale);
    const t = sessionMessages[locale];
    expect(screen.getByRole('heading', { level: 1, name: t.dashboard })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.current })).toBeInTheDocument();
    expect(screen.getAllByText('owner@example.test').length).toBeGreaterThan(0);
    expect(screen.getByText('Super admin')).toBeInTheDocument();
    expect(screen.queryByText('Component workbench')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.dashboard })).toHaveAttribute('href', '/dashboard');
    await waitFor(() =>
      expect(
        screen.queryByText(locale === 'en' ? 'Checking access…' : '正在核对访问权限…'),
      ).not.toBeInTheDocument(),
    );
  },
);

it('uses the email for an unset account name and keeps a readable fallback in the profile', async () => {
  view('en', { ...principal, displayName: null });
  expect(screen.getByText('Name not set')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }));
  expect(screen.getAllByText('owner@example.test').length).toBeGreaterThan(2);
});

it('removes protected content during logout and keeps duplicate attempts locked until full navigation', async () => {
  let resolve: ((value: ApiResult<undefined>) => void) | undefined;
  mocks.request.mockImplementation(
    () =>
      new Promise<ApiResult<undefined>>((done) => {
        resolve = done;
      }),
  );
  view();
  await signOut();
  expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
  expect(screen.getByText('Signing out…')).toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(mocks.replace).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
});

it('does not claim logout succeeded when the request is uncertain and allows a bounded retry', async () => {
  mocks.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce({ ok: true, status: 204, data: undefined, requestId: '' });
  view();
  await signOut();
  expect(await screen.findByText(sessionMessages.en.uncertain)).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
  const retry = screen.getByRole('button', { name: 'Retry sign out' });
  fireEvent.click(retry);
  fireEvent.click(retry);
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledTimes(1));
  expect(mocks.request).toHaveBeenCalledTimes(2);
});

it('navigates away when the server confirms the session is already unauthenticated', async () => {
  mocks.request.mockResolvedValue(failure('unauthenticated', 401));
  view();
  await signOut();
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledOnce());
});

it.each([
  [401, 'invalid_credentials'],
  [403, 'forbidden'],
  [503, 'backend_unavailable'],
] as const)('keeps logout failure HTTP %s/%s visible for retry', async (status, code) => {
  mocks.request.mockResolvedValue(failure(code, status));
  view();
  await signOut();
  expect(await screen.findByRole('button', { name: 'Retry sign out' })).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();
});

it('aborts an in-flight logout on unmount and ignores its late result', async () => {
  let resolve: ((value: ApiResult<undefined>) => void) | undefined;
  let signal: AbortSignal | undefined;
  mocks.request.mockImplementation((input: { signal: AbortSignal }) => {
    ({ signal } = input);
    return new Promise<ApiResult<undefined>>((done) => {
      resolve = done;
    });
  });
  const component = view();
  await signOut();
  component.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolve?.({ ok: true, status: 204, data: undefined, requestId: '' });
    await Promise.resolve();
  });
  expect(mocks.replace).not.toHaveBeenCalled();
});

function SignOutChild() {
  const actions = useSessionActions();
  return <button onClick={() => void actions.signOut()}>Verify changed password</button>;
}

it('uses the same whole-page logout action from account content and the header menu', async () => {
  mocks.request.mockResolvedValue(failure('request_failed', 0, { uncertain: true }));
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <AdminShell principal={principal}>
        <SignOutChild />
      </AdminShell>
    </ShellProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Verify changed password' }));
  expect(await screen.findByText(sessionMessages.en.uncertain)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verify changed password' })).not.toBeInTheDocument();
  expect(screen.queryByText('owner@example.test')).not.toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledOnce();
});

it('rejects session actions outside the shared administrative boundary', () => {
  expect(() => render(<SignOutChild />)).toThrow('SessionActionsProvider is required');
});
