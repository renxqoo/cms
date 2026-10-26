import {
  pageApi,
  resetPageApi,
  collection,
  record,
  descriptor,
  recordId,
  secondId,
  oldVersion,
  newVersion,
  date,
  ok,
  defaultPageRequest,
} from './page-fixture';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentHistory } from '../history';
import { PublicationSchedule } from '../schedule';
import { FolderManager } from '../folder-manager';
import { TrashAction } from '../trash-action';
import { BulkDocuments } from '../bulk-documents';
import { contentMessages } from '../messages';
import { failure } from '../../../api/result';

beforeEach(resetPageApi);
afterEach(() => vi.resetAllMocks());
const t = contentMessages.en;
function historyRow(revision: number) {
  const row = screen.getByText(new RegExp(`^Revision ${revision} ·`)).parentElement;
  if (!row) throw new Error('A rendered historical version must have its own row.');
  return within(row);
}

it('reads historical versions without locale fallback and compares the two explicitly selected identities', async () => {
  const restore = vi.fn<(id: string) => void>();
  renderManagement(
    <DocumentHistory
      document={record()}
      locale="zh-CN"
      t={t}
      busy={false}
      dirty={false}
      onRestore={restore}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await screen.findByText(/^Revision 1 ·/);
  await userEvent.click(historyRow(1).getByRole('button', { name: 'View version' }));
  const dialog = await screen.findByRole('dialog', { name: 'Version' });
  await within(dialog).findByText(/Historical title/);
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'versions.get')?.[0],
  ).toMatchObject({
    params: { collection: 'articles', id: recordId, versionId: oldVersion },
    query: { locale: 'zh-CN', fallback: [], depth: 0, mode: 'editing' },
  });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Back to versions' }));
  expect(screen.getByRole('dialog', { name: 'Version history' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Compare from' }), {
    target: { value: oldVersion },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Compare to' }), {
    target: { value: newVersion },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Compare versions' }));
  await screen.findByText(/Previous title/);
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'versions.diff')?.[0].query,
  ).toEqual({ from: oldVersion, to: newVersion, locale: 'zh-CN' });
  expect(restore).not.toHaveBeenCalled();
});

it('requires explicit confirmation of a complete multilingual history restore and preserves dirty edits', async () => {
  const restore = vi.fn<(id: string) => void>();
  const view = renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={true}
      onRestore={restore}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await screen.findByText(/^Revision 1 ·/);
  expect(historyRow(1).getByRole('button', { name: 'Restore this version' })).toBeDisabled();
  view.unmount();
  renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={false}
      onRestore={restore}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await screen.findByText(/^Revision 1 ·/);
  await userEvent.click(historyRow(1).getByRole('button', { name: 'Restore this version' }));
  const dialog = await screen.findByRole('dialog', { name: 'Restore this version' });
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(
    within(dialog).getByText(
      'Restoring replaces the complete historical snapshot in every language. Save current edits first.',
    ),
  ).toBeInTheDocument();
  expect(restore).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirm action' }));
  expect(restore).toHaveBeenCalledWith(oldVersion);
});

it('cancels pending history reads on close and reads fresh versions when reopened', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'versions.list' ? new Promise(() => {}) : defaultPageRequest(input),
  );
  renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={false}
      onRestore={vi.fn<(id: string) => void>()}
    />,
  );
  expect(pageApi.request).not.toHaveBeenCalled();
  const trigger = screen.getByRole('button', { name: 'Version history' });
  await userEvent.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Version history' });
  expect(within(dialog).getByRole('status')).toHaveTextContent('Loading content…');
  const request = pageApi.request.mock.calls[0]?.[0];
  expect(request?.signal.aborted).toBe(false);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(request?.signal.aborted).toBe(true));
  expect(trigger).toHaveFocus();
  pageApi.request.mockImplementation(defaultPageRequest);
  await userEvent.click(trigger);
  await screen.findByText(/^Revision 1 ·/);
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'versions.list'),
  ).toHaveLength(2);
});

it('returns from restore confirmation without writing and blocks comparing one version with itself', async () => {
  const restore = vi.fn<(id: string) => void>();
  renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={false}
      onRestore={restore}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await screen.findByText(/^Revision 1 ·/);
  await userEvent.click(historyRow(1).getByRole('button', { name: 'Restore this version' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog', { name: 'Version history' })).toBeInTheDocument();
  expect(restore).not.toHaveBeenCalled();
  for (const label of ['Compare from', 'Compare to']) {
    fireEvent.change(screen.getByRole('combobox', { name: label }), {
      target: { value: oldVersion },
    });
  }
  expect(screen.getByRole('button', { name: 'Compare versions' })).toBeDisabled();
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'versions.diff')).toBe(
    false,
  );
});

it('regression: a failed version preview shows its error without claiming it is still loading', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'versions.get'
      ? Promise.resolve(failure('not_found', 404))
      : defaultPageRequest(input),
  );
  renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={false}
      onRestore={vi.fn<(id: string) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await screen.findByText(/^Revision 1 ·/);
  await userEvent.click(historyRow(1).getByRole('button', { name: 'View version' }));
  const dialog = screen.getByRole('dialog', { name: 'Version' });
  await within(dialog).findByRole('alert');
  expect(within(dialog).queryByText('Loading content…')).not.toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Back to versions' }));
  expect(screen.getByRole('dialog', { name: 'Version history' })).toBeInTheDocument();
});

it('keeps unavailable history and denied permissions out of previews and restore controls', async () => {
  pageApi.denied.add('versions.list');
  const view = renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={false}
      onRestore={vi.fn<(id: string) => void>()}
    />,
  );
  expect(pageApi.request).not.toHaveBeenCalled();
  expect(screen.queryByRole('heading', { name: 'Version history' })).not.toBeInTheDocument();
  view.unmount();
  pageApi.denied.clear();
  pageApi.request.mockResolvedValue(failure('forbidden', 403));
  renderManagement(
    <DocumentHistory
      document={record()}
      locale="en"
      t={t}
      busy={false}
      dirty={false}
      onRestore={vi.fn<(id: string) => void>()}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Version history' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('button', { name: 'Restore this version' })).not.toBeInTheDocument();
});

it('schedules the current revision and version in UTC, then links to the accepted durable job', async () => {
  const busy = vi.fn<(value: boolean) => void>();
  pageApi.request.mockResolvedValue(
    ok(
      { jobId: secondId, status: 'queued', location: `/v1/collections/articles/jobs/${secondId}` },
      202,
    ),
  );
  renderManagement(
    <PublicationSchedule
      document={record()}
      t={t}
      onBusyChange={busy}
      onClose={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Publish at'), { target: { value: '2099-01-02T12:30' } });
  await userEvent.click(screen.getByRole('button', { name: 'Schedule publication' }));
  await screen.findByText('Publication schedule accepted');
  expect(pageApi.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'content.schedulePublication',
    params: { collection: 'articles', id: recordId },
    body: {
      revision: 3,
      versionId: newVersion,
      executeAt: new Date('2099-01-02T12:30').toISOString(),
    },
  });
  expect(busy).toHaveBeenCalledWith(true);
  expect(busy).toHaveBeenLastCalledWith(false);
  await userEvent.click(screen.getByRole('button', { name: 'View jobs' }));
  expect(pageApi.push).toHaveBeenCalledWith(
    `/dashboard/jobs?collection=articles&jobId=${secondId}`,
    undefined,
  );
});

it('retries an unknown publication schedule with the same intent and never starts another document mutation', async () => {
  pageApi.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValue(ok({ jobId: secondId, status: 'queued', location: '/jobs' }, 202));
  renderManagement(
    <PublicationSchedule
      document={record()}
      t={t}
      onBusyChange={vi.fn<(value: boolean) => void>()}
      onClose={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Publish at'), { target: { value: '2099-01-02T12:30' } });
  await userEvent.click(screen.getByRole('button', { name: 'Schedule publication' }));
  await screen.findByRole('alert');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Publication schedule accepted');
  expect(pageApi.request.mock.calls[0]?.[0].idempotencyKey).toBe(
    pageApi.request.mock.calls[1]?.[0].idempotencyKey,
  );
  expect(pageApi.request.mock.calls[0]?.[0].body).toEqual(pageApi.request.mock.calls[1]?.[0].body);
});

it('does not remove retained or referenced trash after a rejected permanent deletion', async () => {
  const completed = vi.fn<() => void>();
  pageApi.request.mockResolvedValue(failure('resource_in_use', 409));
  renderManagement(
    <TrashAction
      document={record({ trashedAt: date })}
      action="purge"
      t={t}
      onClose={vi.fn<() => void>()}
      onCompleted={completed}
    />,
  );
  expect(
    screen.getByText(
      'Permanent deletion cannot be undone. The server still enforces retention and reference protection.',
    ),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
  await screen.findByRole('alert');
  expect(completed).not.toHaveBeenCalled();
  expect(pageApi.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.purge',
    body: { revision: 3 },
    params: { collection: 'articles', id: recordId },
  });
});

it('restores trash only after the server confirms the selected revision', async () => {
  const completed = vi.fn<() => void>();
  pageApi.request.mockResolvedValue(ok(record()));
  renderManagement(
    <TrashAction
      document={record({ trashedAt: date })}
      action="restore"
      t={t}
      onClose={vi.fn<() => void>()}
      onCompleted={completed}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
  await waitFor(() => expect(completed).toHaveBeenCalledOnce());
  expect(pageApi.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'documents.restoreTrash',
    body: { revision: 3 },
  });
});

it('builds bulk edits from an empty patch and reports real partial item results without claiming all succeeded', async () => {
  const completed = vi.fn<() => void>();
  const documents = [record(), record({ id: secondId })];
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'collections.editor')
      return Promise.resolve(
        ok(descriptor(record({ id: input.query?.id === secondId ? secondId : recordId }))),
      );
    if (input.operation === 'content.batch')
      return Promise.resolve(
        ok({
          kind: 'content',
          id: oldVersion,
          collection: 'articles',
          action: 'batch',
          status: 'partial',
          executeAt: date,
          createdAt: date,
          finishedAt: date,
          documentId: null,
          expectedRevision: null,
          requestedVersionId: null,
          total: 2,
          succeeded: 1,
          failed: 1,
          items: [
            { position: 0, id: recordId, status: 'succeeded', resultId: recordId },
            { position: 1, id: secondId, status: 'failed', error: { code: 'version_conflict' } },
          ],
        }),
      );
    return defaultPageRequest(input);
  });
  renderManagement(
    <BulkDocuments
      collection={collection}
      documents={documents}
      locale="en"
      trashed={false}
      t={t}
      onClose={vi.fn<() => void>()}
      onCompleted={completed}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Bulk actions' }), {
    target: { value: 'update' },
  });
  await screen.findByRole('textbox', { name: /^Title\*?$/ });
  expect(screen.getByRole('textbox', { name: /^Title\*?$/ })).toHaveValue('');
  fireEvent.change(screen.getByRole('textbox', { name: /^Title\*?$/ }), {
    target: { value: 'Shared new title' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
  await screen.findByText('partial · 1/2');
  expect(screen.getByText(/version_conflict/)).toBeInTheDocument();
  expect(completed).toHaveBeenCalledOnce();
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'content.batch')?.[0].body,
  ).toEqual({
    action: 'update',
    locale: 'en',
    items: [
      { id: recordId, revision: 3, data: { title: 'Shared new title' } },
      { id: secondId, revision: 3, data: { title: 'Shared new title' } },
    ],
  });
});

it('blocks incompatible bulk projections and excessive selections before any batch write', async () => {
  const documents = [record(), record({ id: secondId })];
  pageApi.request.mockImplementation((input) =>
    input.operation === 'collections.editor'
      ? Promise.resolve(
          ok(
            descriptor(record({ id: input.query?.id === secondId ? secondId : recordId }), {
              layout: input.query?.id === secondId ? [] : descriptor().layout,
            }),
          ),
        )
      : defaultPageRequest(input),
  );
  const view = renderManagement(
    <BulkDocuments
      collection={collection}
      documents={documents}
      locale="en"
      trashed={false}
      t={t}
      onClose={vi.fn<() => void>()}
      onCompleted={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Bulk actions' }), {
    target: { value: 'update' },
  });
  await screen.findByText(
    'Selected documents differ in permissions, revisions, or field projection. Edit them individually.',
  );
  expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
  expect(pageApi.request.mock.calls.some(([input]) => input.operation === 'content.batch')).toBe(
    false,
  );
  view.unmount();
  renderManagement(
    <BulkDocuments
      collection={collection}
      documents={Array.from({ length: 101 }, (_, index) => record({ revision: index + 1 }))}
      locale="en"
      trashed={true}
      t={t}
      onClose={vi.fn<() => void>()}
      onCompleted={vi.fn<() => void>()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Confirm action' })).toBeDisabled();
  expect(
    screen.getByText(
      'Bulk update allows at most 10 documents; other bulk actions allow at most 100.',
    ),
  ).toBeInTheDocument();
});

it('verifies an unknown folder update from a real tree read without resending the PATCH', async () => {
  let folder = {
    id: oldVersion,
    name: 'Original folder',
    parentId: null,
    version: 2,
    createdAt: date,
    updatedAt: date,
    children: [],
  };
  const changed = vi.fn<() => void>();
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list') return Promise.resolve(ok({ rows: [folder] }));
    if (input.operation === 'folders.update') {
      folder = { ...folder, name: 'Updated folder', version: 3 };
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<FolderManager collection="articles" t={t} onChanged={changed} />);
  await userEvent.click(screen.getByRole('button', { name: 'Manage folders' }));
  await screen.findByText('Original folder');
  await userEvent.click(screen.getByRole('button', { name: 'Edit folder' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit folder' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: 'Updated folder' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('alert');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'folders.update'),
  ).toHaveLength(1);
  expect(screen.getByRole('dialog', { name: 'Manage folders' })).toBeInTheDocument();
});
it('regression: a folder CAS conflict can read and adopt the new version without discarding its draft', async () => {
  let folder = {
    id: oldVersion,
    name: 'Original folder',
    parentId: null,
    version: 2,
    createdAt: date,
    updatedAt: date,
    children: [],
  };
  let writes = 0;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list') return Promise.resolve(ok({ rows: [folder] }));
    if (input.operation === 'folders.update') {
      writes += 1;
      if (writes === 1) {
        folder = { ...folder, name: 'Concurrent folder', version: 7 };
        return Promise.resolve(failure('version_conflict', 409));
      }
      folder = { ...folder, name: 'My folder draft', version: 8 };
      return Promise.resolve(ok(folder));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<FolderManager collection="articles" t={t} onChanged={vi.fn<() => void>()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Manage folders' }));
  await screen.findByText('Original folder');
  await userEvent.click(screen.getByRole('button', { name: 'Edit folder' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit folder' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: 'My folder draft' },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('alert');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
  await within(dialog).findByText('Concurrent folder');
  expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveValue('My folder draft');
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Keep draft and continue from latest' }),
  );
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'folders.update').at(-1)?.[0]
      .body,
  ).toMatchObject({ version: 7, name: 'My folder draft', collection: 'articles' });
});
it('verifies an unknown folder deletion and only closes after the latest tree confirms absence', async () => {
  let present = true;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list')
      return Promise.resolve(
        ok({
          rows: present
            ? [
                {
                  id: oldVersion,
                  name: 'Delete this folder',
                  parentId: null,
                  version: 2,
                  createdAt: date,
                  updatedAt: date,
                  children: [],
                },
              ]
            : [],
        }),
      );
    if (input.operation === 'folders.delete') {
      present = false;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<FolderManager collection="articles" t={t} onChanged={vi.fn<() => void>()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Manage folders' }));
  await screen.findByText('Delete this folder');
  await userEvent.click(screen.getByRole('button', { name: 'Delete folder' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete folder' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('alert');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'folders.delete'),
  ).toHaveLength(1);
  expect(screen.queryByText('Delete this folder')).not.toBeInTheDocument();
});
it('keeps an unknown folder creation on one idempotent intent until the server confirms it', async () => {
  let created = false;
  let writes = 0;
  const folder = {
    id: oldVersion,
    name: 'New shared folder',
    parentId: null,
    version: 1,
    createdAt: date,
    updatedAt: date,
    children: [],
  };
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list')
      return Promise.resolve(ok({ rows: created ? [folder] : [] }));
    if (input.operation === 'folders.create') {
      writes += 1;
      if (writes === 1) return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
      created = true;
      return Promise.resolve(ok(folder, 201));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<FolderManager collection="articles" t={t} onChanged={vi.fn<() => void>()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Manage folders' }));
  await userEvent.click(await screen.findByRole('button', { name: 'New folder' }));
  const dialog = await screen.findByRole('dialog', { name: 'New folder' });
  fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
    target: { value: folder.name },
  });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('alert');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(await screen.findByText(folder.name)).toBeInTheDocument();
  const calls = pageApi.request.mock.calls.filter(
    ([input]) => input.operation === 'folders.create',
  );
  expect(calls).toHaveLength(2);
  expect(calls[0]?.[0].idempotencyKey).toBe(calls[1]?.[0].idempotencyKey);
});
it('requires a reviewed current folder version before retrying an unconfirmed deletion still present in the tree', async () => {
  let version = 2;
  let present = true;
  let writes = 0;
  pageApi.request.mockImplementation((input) => {
    if (input.operation === 'folders.list')
      return Promise.resolve(
        ok({
          rows: present
            ? [
                {
                  id: oldVersion,
                  name: 'Reviewed delete',
                  parentId: null,
                  version,
                  createdAt: date,
                  updatedAt: date,
                  children: [],
                },
              ]
            : [],
        }),
      );
    if (input.operation === 'folders.delete') {
      writes += 1;
      if (writes === 1) {
        version = 7;
        return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
      }
      present = false;
      return Promise.resolve(ok(undefined, 204));
    }
    return defaultPageRequest(input);
  });
  renderManagement(<FolderManager collection="articles" t={t} onChanged={vi.fn<() => void>()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Manage folders' }));
  await screen.findByText('Reviewed delete');
  await userEvent.click(screen.getByRole('button', { name: 'Delete folder' }));
  const dialog = await screen.findByRole('dialog', { name: 'Delete folder' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByRole('alert');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
  await userEvent.click(
    await within(dialog).findByRole('button', { name: 'Keep draft and continue from latest' }),
  );
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'folders.delete'),
  ).toHaveLength(1);
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(
    pageApi.request.mock.calls.filter(([input]) => input.operation === 'folders.delete').at(-1)?.[0]
      .query,
  ).toEqual({ collection: 'articles', version: 7 });
});
it('reports accepted bulk copy work through its durable job without inventing successful item results', async () => {
  pageApi.request.mockImplementation((input) =>
    input.operation === 'content.batch'
      ? Promise.resolve(ok({ jobId: oldVersion, status: 'queued', location: '/v1/jobs' }, 202))
      : defaultPageRequest(input),
  );
  renderManagement(
    <BulkDocuments
      collection={collection}
      documents={[record()]}
      locale="en"
      trashed={false}
      t={t}
      onClose={vi.fn<() => void>()}
      onCompleted={vi.fn<() => void>()}
    />,
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Bulk actions' }), {
    target: { value: 'copy' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Confirm action' }));
  await screen.findByText('The job was accepted. This does not mean every item completed.');
  await userEvent.click(screen.getByRole('button', { name: 'View jobs' }));
  expect(pageApi.push).toHaveBeenCalledWith(
    `/dashboard/jobs?collection=articles&jobId=${oldVersion}`,
    undefined,
  );
  expect(
    pageApi.request.mock.calls.find(([input]) => input.operation === 'content.batch')?.[0].body,
  ).toEqual({ action: 'copy', locale: 'en', items: [{ id: recordId, revision: 3 }] });
});
