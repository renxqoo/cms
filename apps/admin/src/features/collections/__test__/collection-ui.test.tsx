import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { Document, FolderTree } from '../../../contracts/content';
import type { EditorSnapshot } from '../read-editor';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { createNavigationController } from '../../../components/shell/navigation/controller';
import { CollectionCatalog } from '../collection-catalog';
import { CollectionStructure } from '../collection-structure';
import { CollectionListPage } from '../collection-list-page';
import { snapshot, id, time } from './support';
interface Call {
  operation: string;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  idempotencyKey?: string;
  signal: AbortSignal;
}
const controls = vi.hoisted(() => ({
  request: vi.fn<(input: Call) => Promise<ApiResult<unknown>>>(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  push: vi.fn<(href: string) => void>(),
  denied: new Set<string>(),
  search: '',
  value: null as EditorSnapshot | null,
  rows: [] as Document[],
  folders: [] as FolderTree[],
  navigation: null as ReturnType<typeof createNavigationController> | null,
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    can: (operation: string) => !controls.denied.has(operation),
    reportResult: controls.report,
  }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(controls.search) }));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => ({
    adapter: controls.navigation?.adapter,
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href),
  }),
}));
function navigate(href: string) {
  controls.navigation?.request({ href, kind: 'push' }, () => {
    controls.push(href);
    window.history.pushState(null, '', href);
    controls.search = new URL(href, window.location.href).search.slice(1);
    controls.navigation?.observe(href);
  });
}
function ok(data: unknown, status = 200): ApiResult<unknown> {
  return { ok: true, status, requestId: '', data };
}
function fixture(input: Call): Promise<ApiResult<unknown>> {
  const { value } = controls;
  if (!value) throw new Error('Missing fixture');
  switch (input.operation) {
    case 'collections.get':
      return Promise.resolve(ok(value.collection));
    case 'collections.list':
      return Promise.resolve(ok({ rows: [value.collection] }));
    case 'documents.list':
      return Promise.resolve(
        ok({
          rows: controls.rows,
          total: controls.rows.length,
          page: input.query?.['page'] ?? 1,
          pageSize: input.query?.['pageSize'] ?? 20,
        }),
      );
    case 'folders.list':
      return Promise.resolve(ok({ rows: controls.folders }));
    case 'collections.editor': {
      const row = controls.rows.find((document) => document.id === input.query?.['id']);
      return Promise.resolve(
        ok({
          ...value.editor,
          document: row
            ? {
                id: row.id,
                revision: row.revision,
                versionId: row.versionId,
                trashedAt: row.trashedAt,
              }
            : null,
          intent: input.query?.['intent'] ?? 'update',
        }),
      );
    }
    default:
      return Promise.resolve(failure('not_found', 404));
  }
}
beforeEach(() => {
  controls.value = snapshot();
  controls.rows = controls.value.document ? [controls.value.document] : [];
  controls.folders = [];
  controls.denied = new Set();
  controls.search = '';
  window.history.replaceState(null, '', '/dashboard/collections/articles');
  controls.navigation = createNavigationController('/dashboard/collections/articles');
  controls.request.mockImplementation(fixture);
});
afterEach(() => {
  cleanup();
  controls.navigation?.dispose();
  vi.resetAllMocks();
});
function content(child: React.ReactNode) {
  return <ShellProvider initial={parsePreferences({ locale: 'en' })}>{child}</ShellProvider>;
}
function list() {
  return render(content(<CollectionListPage collection="articles" />));
}
function calls(operation: string) {
  return controls.request.mock.calls
    .filter(([input]) => input.operation === operation)
    .map(([input]) => input);
}
function folder(name = 'Folder', version = 1): FolderTree {
  return {
    id: '50000000-0000-4000-8000-000000000001',
    parentId: null,
    name,
    version,
    createdAt: time,
    updatedAt: time,
    children: [],
  };
}
it('shows only discovered collections and explains when their document read access is unavailable', async () => {
  controls.denied.add('documents.list');
  render(content(<CollectionCatalog />));
  expect(await screen.findByRole('heading', { name: 'Articles' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Articles' })).not.toBeInTheDocument();
  expect(screen.getByText(/required read access is unavailable/)).toBeInTheDocument();
});
it('opens the discovered single-document collection and exposes a safe read-only structure view', async () => {
  if (controls.value) controls.value.collection.singleton = true;
  render(content(<CollectionCatalog />));
  expect(await screen.findByRole('link', { name: 'Open single document' })).toHaveAttribute(
    'href',
    '/dashboard/collections/articles',
  );
  cleanup();
  render(content(<CollectionStructure collection="articles" />));
  expect(await screen.findByText('Mapping fingerprint')).toBeInTheDocument();
  expect(screen.getByText('mapping')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
});
it('loads real document columns and merges search, folder and sorting into the current query', async () => {
  controls.folders = [folder()];
  list();
  await screen.findByRole('link', { name: 'Original' });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search documents' }), {
    target: { value: 'latest' },
  });
  fireEvent.submit(screen.getByRole('search'));
  await waitFor(() =>
    expect(calls('documents.list').some((input) => input.query?.['q'] === 'latest')).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Folder' }), {
    target: { value: '50000000-0000-4000-8000-000000000001' },
  });
  await waitFor(() => expect(controls.push.mock.calls.at(-1)?.[0]).toContain('folderId='));
  fireEvent.click(screen.getByRole('button', { name: 'Title' }));
  await waitFor(() =>
    expect(calls('documents.list').at(-1)?.query?.['sort']).toEqual([
      { field: 'title', order: 'asc' },
    ]),
  );
  expect(calls('documents.list').at(-1)?.query).toMatchObject({
    q: 'latest',
    folderId: '50000000-0000-4000-8000-000000000001',
    fallback: [],
    depth: 0,
  });
});
it('does not render a failed document read as an empty successful list or a zero total', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'documents.list'
      ? Promise.resolve(failure('backend_unavailable', 503))
      : fixture(input),
  );
  list();
  expect(await screen.findByText(/The request could not be completed/)).toBeInTheDocument();
  expect(screen.queryByText('No documents found')).not.toBeInTheDocument();
  expect(screen.queryByText('0 records')).not.toBeInTheDocument();
});
it('builds a queryable-field filter and rejects an invalid set value before applying it', async () => {
  list();
  await screen.findByRole('link', { name: 'Original' });
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const dialog = screen.getByRole('dialog');
  const operators = within(dialog).getAllByRole('combobox', { name: 'Operator' });
  const [, operator] = operators;
  if (!operator) throw new Error('Missing filter operator');
  fireEvent.change(operator, { target: { value: 'in' } });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Value' }), {
    target: { value: 'broken' },
  });
  expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Value' }), {
    target: { value: '["news"]' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }));
  await waitFor(() =>
    expect(calls('documents.list').at(-1)?.query?.['where']).toEqual({
      and: [{ field: 'title', operator: 'in', value: ['news'] }],
    }),
  );
});
it('uses actual folder CAS versions and refreshes the tree after creating and renaming', async () => {
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.create') {
      controls.folders = [folder('Created')];
      return Promise.resolve(ok(folder('Created'), 201));
    }
    if (input.operation === 'folders.update') {
      controls.folders = [folder('Renamed', 2)];
      return Promise.resolve(ok(folder('Renamed', 2)));
    }
    return fixture(input);
  });
  list();
  await screen.findByRole('link', { name: 'Original' });
  fireEvent.click(screen.getByRole('button', { name: 'Create folder' }));
  let dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Name/ }), {
    target: { value: 'Created' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findAllByText('Created');
  expect(calls('folders.create')[0]?.body).toEqual({
    collection: 'articles',
    name: 'Created',
    parentId: null,
  });
  fireEvent.click(screen.getByRole('button', { name: 'Edit folder' }));
  dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Name/ }), {
    target: { value: 'Renamed' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findAllByText('Renamed');
  expect(calls('folders.update')[0]?.body).toEqual({
    collection: 'articles',
    version: 1,
    name: 'Renamed',
    parentId: null,
  });
});
it('keeps a conflicting folder draft until the new directory version is explicitly adopted', async () => {
  controls.folders = [folder()];
  let writes = 0;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.update') {
      writes += 1;
      if (writes === 1) return Promise.resolve(failure('version_conflict', 409));
      controls.folders = [folder('My folder draft', 3)];
      return Promise.resolve(ok(folder('My folder draft', 3)));
    }
    return fixture(input);
  });
  list();
  await screen.findByRole('button', { name: 'Edit folder' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit folder' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: /Name/ }), {
    target: { value: 'My folder draft' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByText(/retained draft/);
  controls.folders = [folder('Remote folder', 2)];
  fireEvent.click(within(dialog).getByRole('button', { name: 'Refresh' }));
  fireEvent.click(
    await within(dialog).findByRole('button', { name: 'Continue editing with current revision' }),
  );
  expect(within(dialog).getByRole('textbox', { name: /Name/ })).toHaveValue('My folder draft');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await screen.findAllByText('My folder draft');
  expect(calls('folders.update')[1]?.body).toMatchObject({ version: 2, name: 'My folder draft' });
});
it('permanently deletes a folder only after the explicit destructive confirmation', async () => {
  controls.folders = [folder()];
  controls.request.mockImplementation((input) => {
    if (input.operation === 'folders.delete') {
      controls.folders = [];
      return Promise.resolve(ok(undefined, 204));
    }
    return fixture(input);
  });
  list();
  await screen.findByRole('button', { name: 'Edit folder' });
  fireEvent.click(screen.getByRole('button', { name: 'Edit folder' }));
  let dialog = screen.getByRole('dialog');
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete folder' }));
  dialog = screen.getByRole('dialog');
  const buttons = within(dialog).getAllByRole('button', { name: 'Delete folder' });
  const confirm = buttons.at(-1);
  if (!confirm) throw new Error('Missing delete confirmation');
  fireEvent.click(confirm);
  await waitFor(() => expect(calls('folders.delete')).toHaveLength(1));
  expect(calls('folders.delete')[0]).toMatchObject({
    params: { id: '50000000-0000-4000-8000-000000000001' },
    query: { collection: 'articles', version: 1 },
  });
});
it.each(['restoreTrash', 'purge'] as const)(
  'keeps trash read only and waits for a real %s result before refreshing',
  async (action) => {
    controls.search = 'trashed=true';
    controls.rows = controls.rows.map((document) => ({ ...document, trashedAt: time }));
    controls.request.mockImplementation((input) => {
      if (input.operation === `documents.${action}`) {
        controls.rows = [];
        return Promise.resolve(
          ok(action === 'purge' ? { id, purged: true } : snapshot(4).document),
        );
      }
      return fixture(input);
    });
    list();
    await screen.findByRole('button', {
      name: action === 'purge' ? 'Permanently delete' : 'Restore from trash',
    });
    expect(screen.queryByRole('link', { name: 'Original' })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: action === 'purge' ? 'Permanently delete' : 'Restore from trash',
      }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', {
        name: action === 'purge' ? 'Permanently delete' : 'Restore from trash',
      }),
    );
    await screen.findByText('No documents found');
    expect(calls(`documents.${action}`)[0]).toMatchObject({
      body: { revision: 3 },
      params: { collection: 'articles', id },
    });
  },
);
it('starts batch edits from an empty common patch and reports the actual per-item terminal result', async () => {
  const resultJob = {
    kind: 'content',
    id: '60000000-0000-4000-8000-000000000001',
    collection: 'articles',
    action: 'batch',
    status: 'succeeded',
    documentId: null,
    expectedRevision: null,
    requestedVersionId: null,
    executeAt: time,
    createdAt: time,
    finishedAt: time,
    total: 1,
    succeeded: 1,
    failed: 0,
    items: [{ position: 0, id, status: 'succeeded' }],
  };
  controls.request.mockImplementation((input) =>
    input.operation === 'content.batch' || input.operation === 'content.getJob'
      ? Promise.resolve(ok(resultJob))
      : fixture(input),
  );
  list();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Select Original' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'update' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Run batch operation' }));
  const dialog = screen.getByRole('dialog');
  const title = await within(dialog).findByRole('textbox', { name: /Title/ });
  expect(title).toHaveValue('');
  fireEvent.change(title, { target: { value: 'Shared new title' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByText(/succeeded/);
  expect(calls('content.batch')[0]?.body).toEqual({
    action: 'update',
    locale: 'en',
    items: [{ id, revision: 3, data: { title: 'Shared new title' } }],
  });
});
it('does not infer a batch update permission from batch discovery or read permission', async () => {
  controls.denied.add('documents.update');
  list();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('checkbox', { name: 'Select Original' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'update' },
  });
  expect(screen.getByRole('button', { name: 'Run batch operation' })).toBeDisabled();
});
it('switching away from an invalid set filter discards that obsolete raw draft and allows the valid exists condition', async () => {
  list();
  await screen.findByRole('link', { name: 'Original' });
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  const dialog = screen.getByRole('dialog');
  const [, operator] = within(dialog).getAllByRole('combobox', { name: 'Operator' });
  if (!operator) throw new Error('Missing operator');
  fireEvent.change(operator, { target: { value: 'in' } });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Value' }), {
    target: { value: 'bad json' },
  });
  expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeDisabled();
  fireEvent.change(operator, { target: { value: 'exists' } });
  expect(within(dialog).getByRole('textbox', { name: 'Value' })).toHaveValue('true');
  expect(within(dialog).getByRole('button', { name: 'Apply' })).toBeEnabled();
});
it('paginates the persisted directory, changes page size and updates language/status without losing explicit query intent', async () => {
  controls.request.mockImplementation((input) =>
    input.operation === 'documents.list'
      ? Promise.resolve(
          ok({
            rows: controls.rows,
            total: 100,
            page: input.query?.['page'] ?? 1,
            pageSize: input.query?.['pageSize'] ?? 20,
          }),
        )
      : fixture(input),
  );
  list();
  await screen.findByRole('link', { name: 'Original' });
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['page']).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['page']).toBe(1));
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '50' },
  });
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['pageSize']).toBe(50));
  fireEvent.change(screen.getByRole('combobox', { name: 'Content language' }), {
    target: { value: 'zh-CN' },
  });
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['locale']).toBe('zh-CN'));
  fireEvent.change(screen.getByRole('combobox', { name: 'View' }), {
    target: { value: 'published' },
  });
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['mode']).toBe('published'));
  fireEvent.change(screen.getByRole('combobox', { name: 'Folder' }), { target: { value: 'null' } });
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['folderId']).toBeNull());
  fireEvent.change(screen.getByRole('combobox', { name: 'Folder' }), { target: { value: 'all' } });
  await waitFor(() => expect(calls('documents.list').at(-1)?.query?.['folderId']).toBeUndefined());
});
it('changes visible columns through the shared selector while keeping the identity column locked', async () => {
  list();
  await screen.findByRole('link', { name: 'Original' });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Columns' }));
  const option = await screen.findByRole('checkbox', { name: 'Revision' });
  await user.click(option);
  await waitFor(() => expect(controls.push.mock.calls.at(-1)?.[0]).toContain('columns='));
  expect(screen.getByRole('columnheader', { name: 'Revision' })).toBeInTheDocument();
});
