import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  cleanup,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';
import { createNavigationController } from '../../../components/shell/navigation/controller';
import { DocumentEditorPage } from '../document-editor-page';
import { useDocumentChannel } from '../use-document-channel';
import { snapshot, id } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        operation: string;
        body?: unknown;
        query?: Readonly<Record<string, unknown>>;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  allowed: new Set<string>(),
  search: 'locale=en',
  navigation: null as ReturnType<typeof createNavigationController> | null,
  push: vi.fn<(href: string) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    can: (operation: string) => !controls.allowed.has(operation),
    reportResult: controls.report,
  }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(controls.search) }));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => ({
    adapter: controls.navigation?.adapter,
    push: controls.push,
    replace: controls.push,
  }),
}));
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: '', data };
}
beforeEach(() => {
  controls.navigation = createNavigationController('/dashboard/collections/articles');
  controls.allowed = new Set();
  controls.search = 'locale=en';
  const value = snapshot();
  controls.request.mockImplementation((input) => {
    switch (input.operation) {
      case 'collections.get':
        return Promise.resolve(ok(value.collection));
      case 'collections.list':
        return Promise.resolve(ok({ rows: [value.collection] }));
      case 'collections.editor':
        return Promise.resolve(ok(value.editor));
      case 'documents.get':
        return Promise.resolve(ok(value.document));
      case 'folders.list':
        return Promise.resolve(ok({ rows: [] }));
      default:
        return Promise.resolve(ok({ rows: [], total: 0, page: 1, pageSize: 20 }));
    }
  });
});
afterEach(() => {
  cleanup();
  controls.navigation?.dispose();
  vi.resetAllMocks();
});
function view(strict = false) {
  const page = (
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <DocumentEditorPage collection="articles" id={id} />
    </ShellProvider>
  );
  return render(strict ? <StrictMode>{page}</StrictMode> : page);
}
it.each(['readiness', 'permission'])(
  'regression: asset %s loss pauses the React channel without an update loop',
  (reason) => {
    const initial = snapshot();
    const created = vi.fn<(id: string) => void>();
    const archived = vi.fn<() => void>();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const hook = renderHook(
      ({ ready }) =>
        useDocumentChannel({ initial, readReady: ready, onCreated: created, onArchived: archived }),
      { initialProps: { ready: true } },
    );
    try {
      act(() => {
        hook.result.current.channel.edit({ title: 'Retained local title' });
        expect(hook.result.current.channel.beginAsset('replace')).not.toBeNull();
      });
      if (reason === 'permission') controls.allowed.add('documents.update');
      expect(() => hook.rerender({ ready: reason === 'permission' })).not.toThrow();
      expect(() => hook.rerender({ ready: reason === 'permission' })).not.toThrow();
      expect(hook.result.current.state).toMatchObject({
        phase: 'blocked',
        draft: { title: 'Retained local title' },
        pending: { source: 'asset', kind: 'replace' },
        error: { status: 403 },
      });
      expect(created).not.toHaveBeenCalled();
      expect(archived).not.toHaveBeenCalled();
    } finally {
      hook.unmount();
      logged.mockRestore();
    }
  },
);
it('regression: a Strict Mode effect cleanup probe does not permanently disable document saving', async () => {
  view(true);
  const title = await screen.findByRole('textbox', { name: /Title/ });
  fireEvent.change(title, { target: { value: 'Changed after strict probe' } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await waitFor(() =>
    expect(
      controls.request.mock.calls.some(([input]) => input.operation === 'documents.update'),
    ).toBe(true),
  );
});

it('regression: a confirmed save refreshes the history list without losing the selected immutable version', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  const before = snapshot();
  let current = before;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'documents.update') {
      current = snapshot(4, 'Latest saved');
      if (current.document) current.document.versionId = '20000000-0000-4000-8000-000000000002';
      if (current.editor.document)
        current.editor.document.versionId = '20000000-0000-4000-8000-000000000002';
      return Promise.resolve(ok(current.document));
    }
    if (input.operation === 'collections.editor') return Promise.resolve(ok(current.editor));
    if (input.operation === 'documents.get') return Promise.resolve(ok(current.document));
    if (input.operation === 'versions.list') {
      const rows = [
        {
          id: '20000000-0000-4000-8000-000000000001',
          revision: 3,
          schemaVersion: 1,
          kind: 'save',
          actorId: '10000000-0000-4000-8000-000000000001',
          createdAt: '2026-10-26T00:00:00.000Z',
        },
      ];
      if (current.document?.revision === 4)
        rows.unshift({
          id: '20000000-0000-4000-8000-000000000002',
          revision: 4,
          schemaVersion: 1,
          kind: 'save',
          actorId: '10000000-0000-4000-8000-000000000001',
          createdAt: '2026-10-26T00:00:00.000Z',
        });
      return Promise.resolve(ok({ rows, total: rows.length, page: 1, pageSize: 20 }));
    }
    if (input.operation === 'versions.get')
      return Promise.resolve(
        ok({
          ...before.document,
          schemaVersion: 1,
          kind: 'save',
          actorId: '10000000-0000-4000-8000-000000000001',
        }),
      );
    return original(input);
  });
  view();
  const title = await screen.findByRole('textbox', { name: /Title/ });
  const select = await screen.findByRole('combobox', { name: /^Version$/ });
  await screen.findAllByRole('option', { name: /3 · save/ });
  fireEvent.change(select, { target: { value: '20000000-0000-4000-8000-000000000001' } });
  await screen.findByText(/This is a fixed historical snapshot/);
  fireEvent.change(title, { target: { value: 'Latest saved' } });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await waitFor(() =>
    expect(
      screen
        .getByRole('combobox', { name: 'Version' })
        .querySelector('option[value="20000000-0000-4000-8000-000000000002"]'),
    ).not.toBeNull(),
  );
  expect(select).toHaveValue('20000000-0000-4000-8000-000000000001');
  expect(screen.getByText(/This is a fixed historical snapshot/)).toBeInTheDocument();
});

it('regression: a confirmed empty schedule cancellation refreshes the persisted directory even though the document revision is unchanged', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  let created = false;
  let cancelled = false;
  const jobId = '60000000-0000-4000-8000-000000000001';
  controls.request.mockImplementation((input) => {
    if (input.operation === 'content.listJobs') {
      const rows = created
        ? [
            {
              kind: 'content',
              id: jobId,
              collection: 'articles',
              action: 'publication',
              status: cancelled ? 'cancelled' : 'queued',
              documentId: id,
              expectedRevision: 3,
              requestedVersionId: '20000000-0000-4000-8000-000000000001',
              executeAt: '2030-01-01T00:00:00.000Z',
              createdAt: '2026-10-26T00:00:00.000Z',
              finishedAt: null,
              total: 1,
              succeeded: 0,
              failed: 0,
            },
          ]
        : [];
      return Promise.resolve(ok({ rows, total: rows.length, page: 1, pageSize: 20 }));
    }
    if (input.operation === 'content.schedulePublication') {
      created = true;
      return Promise.resolve({
        ok: true,
        status: 202,
        requestId: '',
        data: { jobId, status: 'queued', location: '/v1/jobs/job' },
      });
    }
    if (input.operation === 'content.cancelPublicationSchedule') {
      cancelled = true;
      return Promise.resolve({ ok: true, status: 204, requestId: '', data: undefined });
    }
    return original(input);
  });
  view();
  const date = await screen.findByLabelText('Execute at (your local time)');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Schedule publication' })).toBeEnabled(),
  );
  fireEvent.change(date, { target: { value: '2030-01-01T12:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Schedule publication' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel schedule' }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Cancel schedule' })).not.toBeInTheDocument(),
  );
  expect(screen.getByText(/cancelled/)).toBeInTheDocument();
});

it('regression: archiving suspends field editing while the destructive request is in flight', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  controls.request.mockImplementation((input) =>
    input.operation === 'documents.archive' ? new Promise(() => {}) : original(input),
  );
  view();
  const title = await screen.findByRole('textbox', { name: /Title/ });
  fireEvent.click(screen.getByRole('button', { name: 'Move to trash' }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
  await waitFor(() =>
    expect(
      controls.request.mock.calls.some(([input]) => input.operation === 'documents.archive'),
    ).toBe(true),
  );
  expect(title).toHaveAttribute('readonly');
});

it('regression: an unconfirmed non-idempotent patch offers a private reread instead of an inert retry button', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  controls.request.mockImplementation((input) =>
    input.operation === 'documents.update'
      ? Promise.resolve({
          ok: false,
          status: 0,
          error: { code: 'request_failed', message: 'Safe error', requestId: '' },
          retryAfterSeconds: null,
          uncertain: true,
        })
      : original(input),
  );
  view();
  fireEvent.change(await screen.findByRole('textbox', { name: /Title/ }), {
    target: { value: 'Uncertain patch' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await screen.findByRole('button', { name: 'Read current document' });
  expect(
    screen.queryByRole('button', { name: 'Verify or retry the same operation' }),
  ).not.toBeInTheDocument();
});
it.each([false, true])(
  'conflict inspection keeps the draft until an explicit discard=%s decision',
  async (discard) => {
    const original = controls.request.getMockImplementation();
    if (!original) throw new Error('Missing fixture');
    let current = snapshot();
    controls.request.mockImplementation((input) => {
      if (input.operation === 'documents.update')
        return Promise.resolve({
          ok: false,
          status: 409,
          error: { code: 'version_conflict', message: 'Conflict', requestId: 'conflict' },
          retryAfterSeconds: null,
          uncertain: false,
        });
      if (input.operation === 'collections.editor') return Promise.resolve(ok(current.editor));
      if (input.operation === 'documents.get') return Promise.resolve(ok(current.document));
      return original(input);
    });
    view();
    fireEvent.change(await screen.findByRole('textbox', { name: /Title/ }), {
      target: { value: 'Preserved local draft' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
    const inspect = await screen.findByRole('button', { name: 'Read current document' });
    current = snapshot(8, 'Remote title');
    fireEvent.click(inspect);
    await screen.findByText('Remote title', { exact: false, selector: 'pre' });
    fireEvent.click(
      screen.getByRole('button', {
        name: discard
          ? 'Discard draft and load current document'
          : 'Continue editing with current revision',
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /Title/ })).toHaveValue(
        discard ? 'Remote title' : 'Preserved local draft',
      ),
    );
    expect(
      controls.request.mock.calls.filter(([input]) => input.operation === 'documents.update'),
    ).toHaveLength(1);
  },
);
it('publication confirmation can be cancelled without a request before explicitly confirming the operation', async () => {
  view();
  await screen.findByRole('textbox', { name: /Title/ });
  fireEvent.click(screen.getByRole('button', { name: /^Publish$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
  expect(
    controls.request.mock.calls.some(([input]) => input.operation === 'documents.publish'),
  ).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: /^Publish$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
  await waitFor(() =>
    expect(
      controls.request.mock.calls.some(([input]) => input.operation === 'documents.publish'),
    ).toBe(true),
  );
});
it('content locale selection requests a guarded navigation to the exact registered document and preserves the locale', async () => {
  view();
  await screen.findByRole('textbox', { name: /Title/ });
  fireEvent.change(screen.getByRole('combobox', { name: 'Content language' }), {
    target: { value: 'zh-CN' },
  });
  expect(controls.push).toHaveBeenCalledWith(`/dashboard/collections/articles/${id}?locale=zh-CN`);
});
it('a singleton create conflict offers only a real unfiltered lookup and links the returned persisted id', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  const value = snapshot();
  controls.request.mockImplementation((input) => {
    if (input.operation === 'collections.get')
      return Promise.resolve(ok({ ...value.collection, singleton: true }));
    if (input.operation === 'collections.editor')
      return Promise.resolve(ok({ ...value.editor, intent: 'create', document: null }));
    if (input.operation === 'documents.list')
      return Promise.resolve(ok({ rows: [value.document], total: 1, page: 1, pageSize: 1 }));
    return original(input);
  });
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <DocumentEditorPage collection="articles" />
    </ShellProvider>,
  );
  const lookup = await screen.findByRole('button', { name: 'Open single document' });
  expect(controls.request.mock.calls.some(([input]) => input.operation === 'documents.list')).toBe(
    false,
  );
  fireEvent.click(lookup);
  await screen.findByRole('link', { name: `Open single document · ${id}` });
  expect(
    controls.request.mock.calls.find(([input]) => input.operation === 'documents.list')?.[0].query,
  ).toEqual({
    page: 1,
    pageSize: 1,
    locale: 'en',
    fallback: [],
    depth: 0,
    mode: 'editing',
    trashed: false,
  });
  fireEvent.click(lookup);
  await waitFor(() =>
    expect(
      controls.request.mock.calls.filter(([input]) => input.operation === 'documents.list'),
    ).toHaveLength(2),
  );
});
it('compares immutable versions, cancels restoration, then submits the explicit selected version against the current revision', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  const value = snapshot();
  const older = '20000000-0000-4000-8000-000000000002';
  controls.request.mockImplementation((input) => {
    if (input.operation === 'versions.list')
      return Promise.resolve(
        ok({
          rows: [
            {
              id: value.document?.versionId,
              revision: 3,
              schemaVersion: 1,
              kind: 'save',
              actorId: id,
              createdAt: '2026-10-26T00:00:00.000Z',
            },
            {
              id: older,
              revision: 2,
              schemaVersion: 1,
              kind: 'save',
              actorId: id,
              createdAt: '2026-10-26T00:00:00.000Z',
            },
          ],
          total: 25,
          page: 1,
          pageSize: 20,
        }),
      );
    if (input.operation === 'versions.get')
      return Promise.resolve(
        ok({ ...value.document, schemaVersion: 1, kind: 'save', actorId: id }),
      );
    if (input.operation === 'versions.diff')
      return Promise.resolve(
        ok({
          from: older,
          to: value.document?.versionId,
          changes: [{ field: 'title', before: 'Before translation', after: 'After translation' }],
        }),
      );
    if (input.operation === 'versions.restore') return Promise.resolve(ok(value.document));
    return original(input);
  });
  view();
  const select = await screen.findByRole('combobox', { name: 'Version' });
  await screen.findByRole('option', { name: /3 · save/ });
  fireEvent.change(select, { target: { value: value.document?.versionId } });
  const restore = await screen.findByRole('button', { name: 'Restore full snapshot' });
  await waitFor(() => expect(restore).toBeEnabled());
  fireEvent.change(screen.getByRole('combobox', { name: 'From version' }), {
    target: { value: older },
  });
  expect(await screen.findByLabelText('Before')).toHaveTextContent('Before translation');
  expect(screen.getByLabelText('After')).toHaveTextContent('After translation');
  fireEvent.click(restore);
  expect(screen.getByRole('dialog')).toHaveTextContent('Every language');
  fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
  expect(
    controls.request.mock.calls.some(([input]) => input.operation === 'versions.restore'),
  ).toBe(false);
  fireEvent.click(restore);
  fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
  await waitFor(() =>
    expect(
      controls.request.mock.calls.find(([input]) => input.operation === 'versions.restore')?.[0]
        .body,
    ).toEqual({ revision: 3, versionId: value.document?.versionId, locale: 'en' }),
  );
});
it('unpublishes only through confirmation and shows the copied document link from the real copy receipt', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  const value = snapshot();
  if (value.document) value.document.publishedVersionId = value.document.versionId;
  const copiedId = '10000000-0000-4000-8000-000000000002';
  controls.request.mockImplementation((input) => {
    if (input.operation === 'documents.get') return Promise.resolve(ok(value.document));
    if (input.operation === 'documents.copy')
      return Promise.resolve(ok({ ...value.document, id: copiedId }));
    if (input.operation === 'documents.unpublish') {
      if (value.document) value.document.publishedVersionId = null;
      return Promise.resolve(ok(value.document));
    }
    return original(input);
  });
  view();
  fireEvent.click(await screen.findByRole('button', { name: /^Unpublish$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /^Unpublish$/ })).not.toBeInTheDocument(),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Duplicate$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirm$/ }));
  expect(await screen.findByRole('link', { name: `Duplicate · ${copiedId}` })).toHaveAttribute(
    'href',
    `/dashboard/collections/articles/${copiedId}?locale=en`,
  );
});
it('successful creation replaces the new-document route with the confirmed persisted identifier', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  const value = snapshot();
  let created = false;
  controls.request.mockImplementation((input) => {
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(created ? value.editor : { ...value.editor, intent: 'create', document: null }),
      );
    if (input.operation === 'documents.create') {
      created = true;
      return Promise.resolve(ok(value.document));
    }
    return original(input);
  });
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <DocumentEditorPage collection="articles" />
    </ShellProvider>,
  );
  fireEvent.change(await screen.findByRole('textbox', { name: /Title/ }), {
    target: { value: 'Created title' },
  });
  fireEvent.click(screen.getByRole('button', { name: /^Save$/ }));
  await waitFor(() =>
    expect(controls.push).toHaveBeenCalledWith(`/dashboard/collections/articles/${id}?locale=en`),
  );
});
it('keeps autosave explicitly controlled and does not schedule publication for an empty or past local date', async () => {
  view();
  await screen.findByRole('textbox', { name: /Title/ });
  const auto = screen.getByRole('switch', { name: 'Enable autosave' });
  fireEvent.click(auto);
  expect(auto).toBeChecked();
  fireEvent.click(auto);
  expect(auto).not.toBeChecked();
  const button = screen.getByRole('button', { name: 'Schedule publication' });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await screen.findByText('Choose a valid future date and time.');
  expect(
    controls.request.mock.calls.some(
      ([input]) => input.operation === 'content.schedulePublication',
    ),
  ).toBe(false);
  fireEvent.change(screen.getByLabelText('Execute at (your local time)'), {
    target: { value: '2000-01-01T12:00' },
  });
  fireEvent.click(button);
  expect(
    controls.request.mock.calls.some(
      ([input]) => input.operation === 'content.schedulePublication',
    ),
  ).toBe(false);
});
it('pages schedules and historical versions independently and can refresh the protected document without creating a write', async () => {
  const original = controls.request.getMockImplementation();
  if (!original) throw new Error('Missing fixture');
  controls.request.mockImplementation((input) =>
    input.operation === 'versions.list' || input.operation === 'content.listJobs'
      ? Promise.resolve(ok({ rows: [], total: 25, page: input.query?.['page'] ?? 1, pageSize: 20 }))
      : original(input),
  );
  view();
  await screen.findByRole('textbox', { name: /Title/ });
  const headings = ['Publication schedules', 'Version history'];
  for (const name of headings) {
    const card = screen.getByRole('heading', { name }).parentElement?.parentElement;
    if (!card) throw new Error('Missing card');
    const next = within(card).getByRole('button', { name: 'Next' });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);
    await waitFor(() =>
      expect(
        controls.request.mock.calls.some(
          ([input]) =>
            input.operation ===
              (name === 'Version history' ? 'versions.list' : 'content.listJobs') &&
            input.query?.['page'] === 2,
        ),
      ).toBe(true),
    );
    fireEvent.click(within(card).getByRole('button', { name: 'Previous' }));
  }
  const reads = controls.request.mock.calls.filter(
    ([input]) => input.operation === 'documents.get',
  ).length;
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Refresh' })[0] ??
      screen.getByRole('button', { name: 'missing' }),
  );
  await waitFor(() =>
    expect(
      controls.request.mock.calls.filter(([input]) => input.operation === 'documents.get').length,
    ).toBeGreaterThan(reads),
  );
  expect(
    controls.request.mock.calls.some(([input]) => input.operation === 'documents.update'),
  ).toBe(false);
});
