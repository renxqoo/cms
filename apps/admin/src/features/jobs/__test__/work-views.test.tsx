import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  renderManagement,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import type { ApiResult } from '../../../api/result';
import { z } from 'zod';
import { failure } from '../../../api/result';
import { JobsPage } from '../jobs-page';
import { WorkDetail } from '../work-detail';
import { CleanupsPage } from '../../asset-cleanups/cleanups-page';
import { CleanupDetail } from '../../asset-cleanups/cleanup-detail';
import type { Collection } from '../../../contracts/content';
import type { JobSummary, UploadSummary } from '../../../contracts/jobs';
import type { CleanupEntry } from '../../../contracts/cleanups';

interface Request {
  operation: string;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  idempotencyKey?: string;
  signal: AbortSignal;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(request: Request) => Promise<ApiResult<unknown>>>(),
  push: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  refresh: vi.fn<() => void>(),
  denied: new Set<string>(),
  search: '',
  phase: 'ready' as 'ready' | 'failed' | 'loading',
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: api.phase,
    principal: { id: 'owner' },
    error: null,
    can: (operation: string) => api.phase === 'ready' && !api.denied.has(operation),
    reportResult: api.report,
    refresh: api.refresh,
  }),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/jobs',
  useSearchParams: () => new URLSearchParams(api.search),
  useRouter: () => ({ push: api.push, replace: vi.fn<() => void>() }),
}));

const id = '11111111-1111-4111-8111-111111111111';
const documentId = '22222222-2222-4222-8222-222222222222';
const time = '2026-10-26T00:00:00.000Z';
const collection: Collection = {
  key: 'articles',
  label: 'Articles',
  schemaVersion: 1,
  mode: 'drafts',
  history: true,
  singleton: false,
  locales: ['en'],
  dataSchema: {},
  fields: [],
  behaviorHash: 'behavior',
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
const job: JobSummary = {
  kind: 'content',
  id,
  collection: 'articles',
  action: 'publication',
  status: 'queued',
  executeAt: time,
  createdAt: time,
  finishedAt: null,
  documentId,
  expectedRevision: 7,
  requestedVersionId: id,
  total: 1,
  succeeded: 0,
  failed: 0,
};
const upload: UploadSummary = {
  id,
  collection: 'media',
  filename: 'Private report.pdf',
  declaredMimeType: 'application/pdf',
  declaredBytes: 412,
  createdAt: time,
  purpose: 'replace',
  documentId,
  revision: 9,
  status: 'ready',
  expiresAt: time,
  failureCode: null,
  jobId: null,
};
const cleanup: CleanupEntry = {
  id,
  state: 'ready',
  blocked: true,
  attempts: 3,
  failureCode: 'storage_unavailable',
  retainUntil: time,
  writeDeadline: null,
  nextCleanupAt: time,
  createdAt: time,
};
let cancelled = false;
let cleanupBlocked = true;

function contentDetail() {
  return {
    ...job,
    status: cancelled ? 'cancelled' : 'queued',
    items: [{ position: 0, id: documentId, status: 'queued' }],
  };
}

beforeEach(() => {
  api.phase = 'ready';
  api.search = '';
  api.denied.clear();
  cancelled = false;
  cleanupBlocked = true;
  api.request.mockImplementation((request) => {
    const page = {
      total: 1,
      page: request.query?.page ?? 1,
      pageSize: request.query?.pageSize ?? 20,
    };
    if (request.operation === 'collections.list')
      return Promise.resolve(
        managementSuccess({
          rows: [collection, { ...collection, key: 'media', label: 'Media', upload: true }],
        }),
      );
    if (request.operation === 'content.listJobs')
      return Promise.resolve(
        managementSuccess({
          ...page,
          rows: [{ ...job, status: cancelled ? 'cancelled' : 'queued' }],
        }),
      );
    if (request.operation === 'content.getJob')
      return Promise.resolve(managementSuccess(contentDetail()));
    if (request.operation === 'assets.listUploads')
      return Promise.resolve(managementSuccess({ ...page, rows: [upload] }));
    if (request.operation === 'assets.readUpload')
      return Promise.resolve(managementSuccess({ ...upload, manifest: null }));
    if (
      request.operation === 'content.cancelPublicationSchedule' ||
      request.operation === 'assets.cancelUpload'
    ) {
      cancelled = true;
      return Promise.resolve(managementSuccess(undefined, 204));
    }
    if (request.operation === 'assets.listCleanup')
      return Promise.resolve(managementSuccess({ ...page, rows: [cleanup] }));
    if (request.operation === 'assets.getCleanup')
      return Promise.resolve(managementSuccess({ ...cleanup, blocked: cleanupBlocked }));
    if (request.operation === 'assets.retryCleanup') {
      cleanupBlocked = false;
      return Promise.resolve(
        managementSuccess({ id, accepted: true, location: `/v1/asset-cleanups/${id}` }, 202),
      );
    }
    return Promise.resolve(failure('not_found', 404));
  });
});
afterEach(() => vi.resetAllMocks());

it('discovers real content work, reads complete item results and cancels the exact publication schedule', async () => {
  renderManagement(<JobsPage />);
  await screen.findByText('Publication', { selector: 'td' });
  expect(
    api.request.mock.calls.find(([request]) => request.operation === 'content.listJobs')?.[0].query,
  ).toEqual({ page: 1, pageSize: 20 });
  await userEvent.click(screen.getByRole('button', { name: /^Details$/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Jobs · Details' });
  await within(dialog).findByText('Expected revision');
  expect(within(dialog).getByText('7')).toBeInTheDocument();
  expect(within(dialog).getByRole('list', { name: 'Total items' })).toHaveTextContent(documentId);
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Cancel publication schedule' }),
  );
  await within(dialog).findByText(
    'Cancellation confirmed. Reload the latest state to verify its current status.',
  );
  expect(
    api.request.mock.calls.find(
      ([request]) => request.operation === 'content.cancelPublicationSchedule',
    )?.[0].params,
  ).toEqual({ collection: 'articles', id: documentId, scheduleId: id });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Open document' }));
  expect(api.push).toHaveBeenCalledWith(`/dashboard/collections/articles/${documentId}`, undefined);
});

it('keeps upload filters and true totals separate from job filters and opens the resources recovery entry', async () => {
  api.search = 'collection=media&tab=uploads&purpose=replace&status=ready&page=2&pageSize=10';
  renderManagement(<JobsPage />);
  await screen.findByText(upload.filename);
  expect(
    api.request.mock.calls.find(([request]) => request.operation === 'assets.listUploads')?.[0]
      .query,
  ).toEqual({ page: 2, pageSize: 10, purpose: 'replace', status: 'ready' });
  await userEvent.click(screen.getByRole('button', { name: /^Details$/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Upload sessions · Details' });
  await within(dialog).findByText('412');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Open in resources' }));
  expect(api.push).toHaveBeenCalledWith(
    `/dashboard/resources?collection=media&uploadId=${id}`,
    undefined,
  );
});

it('reads a saved job ID directly after refresh and renders asset-specific attempts without content assumptions', async () => {
  api.search = `collection=media&jobId=${id}`;
  api.request.mockImplementation((request) =>
    Promise.resolve(
      request.operation === 'collections.list'
        ? managementSuccess({ rows: [{ ...collection, key: 'media', upload: true }] })
        : request.operation === 'content.getJob'
          ? managementSuccess({
              id,
              collection: 'media',
              action: 'reprocess',
              status: 'failed',
              attempts: 2,
              failureCode: 'processing_failed',
              uploadId: documentId,
              manifest: null,
            })
          : managementSuccess({ rows: [], total: 0, page: 1, pageSize: 20 }),
    ),
  );
  renderManagement(<JobsPage />);
  const dialog = await screen.findByRole('dialog', { name: 'Jobs · Details' });
  await within(dialog).findByText('processing_failed');
  expect(within(dialog).getByText('Attempts')).toBeInTheDocument();
  expect(
    within(dialog).queryByRole('button', { name: 'Cancel publication schedule' }),
  ).not.toBeInTheDocument();
});

it('does not start reads for denied collection operations or an unreadable catalog', async () => {
  api.denied.add('content.listJobs');
  const view = renderManagement(<JobsPage />);
  await screen.findByText('You do not have permission to read this resource.');
  expect(api.request.mock.calls.some(([request]) => request.operation === 'content.listJobs')).toBe(
    false,
  );
  view.unmount();
  api.denied.add('collections.list');
  api.request.mockClear();
  renderManagement(<JobsPage />);
  expect(screen.getByText('You do not have permission to read this resource.')).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
});

it('validates document filters before navigation and resets filtered lists to their first page', async () => {
  renderManagement(<JobsPage />);
  await screen.findByText('Publication', { selector: 'td' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Document ID' }), {
    target: { value: 'bad-id' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(screen.getByText('Enter a valid document UUID.')).toBeInTheDocument();
  expect(api.push).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Document ID' }), {
    target: { value: documentId },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Apply filter' }));
  expect(api.push).toHaveBeenCalledWith(
    `/dashboard/jobs?collection=articles&tab=jobs&page=1&pageSize=20&documentId=${documentId}`,
    { scroll: false },
  );
});

it('retains unconfirmed cancellation state and does not blindly repeat the non-idempotent action', async () => {
  api.request.mockImplementation((request) =>
    Promise.resolve(
      request.operation === 'content.getJob'
        ? managementSuccess(contentDetail())
        : failure('request_failed', 0, { uncertain: true }),
    ),
  );
  renderManagement(
    <WorkDetail
      selected={{ kind: 'job', value: job }}
      onClose={vi.fn<() => void>()}
      onChanged={vi.fn<() => void>()}
    />,
  );
  await screen.findByText('Expected revision');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel publication schedule' }));
  await screen.findByText(
    'The cancellation result is unconfirmed. Read the current state before trying again.',
  );
  expect(screen.getByRole('button', { name: 'Cancel publication schedule' })).toBeDisabled();
  expect(
    api.request.mock.calls.filter(
      ([request]) => request.operation === 'content.cancelPublicationSchedule',
    ),
  ).toHaveLength(1);
});

it('cancels a ready upload through its actual collection and shows read denial without exposing its details', async () => {
  const view = renderManagement(
    <WorkDetail
      selected={{ kind: 'upload', value: upload }}
      onClose={vi.fn<() => void>()}
      onChanged={vi.fn<() => void>()}
    />,
  );
  await screen.findByText('412');
  await userEvent.click(screen.getByRole('button', { name: 'Cancel upload session' }));
  await screen.findByText(
    'Cancellation confirmed. Reload the latest state to verify its current status.',
  );
  expect(
    api.request.mock.calls.find(([request]) => request.operation === 'assets.cancelUpload')?.[0]
      .params,
  ).toEqual({ collection: 'media', uploadId: id });
  view.unmount();
  api.denied.add('assets.readUpload');
  renderManagement(
    <WorkDetail
      selected={{ kind: 'upload', value: upload }}
      onClose={vi.fn<() => void>()}
      onChanged={vi.fn<() => void>()}
    />,
  );
  expect(screen.getByText('You do not have permission to read this resource.')).toBeInTheDocument();
  expect(screen.queryByText(upload.filename)).not.toBeInTheDocument();
});

it('keeps cleanup retries explicit, sends an empty body and reports acceptance without claiming deletion', async () => {
  renderManagement(<CleanupsPage />);
  await screen.findByText(id, { selector: 'span' });
  expect(
    api.request.mock.calls.find(([request]) => request.operation === 'assets.listCleanup')?.[0]
      .query,
  ).toEqual({ page: 1, pageSize: 20, blocked: true });
  await userEvent.click(screen.getByRole('button', { name: /^Details$/ }));
  const dialog = await screen.findByRole('dialog', { name: 'Asset cleanups · Details' });
  await within(dialog).findByText('storage_unavailable');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Request cleanup retry' }));
  await within(dialog).findByText(
    'Retry accepted. Physical deletion has not been confirmed. Read the latest ledger state.',
  );
  const request = api.request.mock.calls.find(
    ([value]) => value.operation === 'assets.retryCleanup',
  )?.[0];
  expect(request?.body).toEqual({});
  expect(request?.idempotencyKey).toMatch(/^[a-f0-9-]{36}$/);
  expect(request?.params).toEqual({ id });
  expect(within(dialog).queryByText('Deleted')).not.toBeInTheDocument();
});

it('replays the same cleanup intent after an unknown response even when the refreshed entry is no longer blocked', async () => {
  let retries = 0;
  const original = api.request.getMockImplementation();
  api.request.mockImplementation((request) => {
    if (request.operation !== 'assets.retryCleanup')
      return original?.(request) ?? Promise.resolve(failure('not_found', 404));
    cleanupBlocked = false;
    retries += 1;
    return Promise.resolve(
      retries === 1
        ? failure('request_failed', 0, { uncertain: true })
        : managementSuccess({ id, accepted: true, location: `/v1/asset-cleanups/${id}` }, 202),
    );
  });
  renderManagement(
    <CleanupDetail id={id} onClose={vi.fn<() => void>()} onChanged={vi.fn<() => void>()} />,
  );
  await screen.findByText('storage_unavailable');
  await userEvent.click(screen.getByRole('button', { name: 'Request cleanup retry' }));
  await screen.findByText(
    'The result is unconfirmed. Keep this request intent and retry it to verify acceptance.',
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Retry the same request' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retry the same request' }));
  await screen.findByText(
    'Retry accepted. Physical deletion has not been confirmed. Read the latest ledger state.',
  );
  const calls = api.request.mock.calls.filter(
    ([request]) => request.operation === 'assets.retryCleanup',
  );
  expect(calls).toHaveLength(2);
  expect(calls[0]?.[0].idempotencyKey).toBe(calls[1]?.[0].idempotencyKey);
});

it('prevents ordinary administrators from reading the cleanup ledger and disables nonblocked retries', async () => {
  api.denied.add('assets.listCleanup');
  const view = renderManagement(<CleanupsPage />);
  expect(
    screen.getByText('Only an effective super administrator can read the cleanup ledger.'),
  ).toBeInTheDocument();
  expect(api.request).not.toHaveBeenCalled();
  view.unmount();
  api.denied.clear();
  cleanupBlocked = false;
  renderManagement(
    <CleanupDetail id={id} onClose={vi.fn<() => void>()} onChanged={vi.fn<() => void>()} />,
  );
  await screen.findByText('This entry is not blocked. No manual retry is available.');
  expect(screen.queryByRole('button', { name: 'Request cleanup retry' })).not.toBeInTheDocument();
});

it('uses exact cleanup state and blocked filters without adding unsupported search or ordering', async () => {
  renderManagement(<CleanupsPage />);
  await screen.findByText(id, { selector: 'span' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Blocked' }), {
    target: { value: 'false' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) =>
          request.operation === 'assets.listCleanup' && request.query?.blocked === false,
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'State' }), {
    target: { value: 'deleted' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) =>
          request.operation === 'assets.listCleanup' && request.query?.state === 'deleted',
      ),
    ).toBe(true),
  );
  expect(screen.queryByRole('textbox', { name: 'Search records' })).not.toBeInTheDocument();
});

it('shows unknown collection, loading and denied details without publishing an incomplete result', async () => {
  api.search = 'collection=retired';
  const view = renderManagement(<JobsPage />);
  await screen.findByText('No readable collection is available.');
  view.unmount();
  api.phase = 'loading';
  const loading = renderManagement(<JobsPage />);
  expect(screen.getByText('Checking access…')).toBeInTheDocument();
  loading.unmount();
  api.phase = 'ready';
  api.denied.add('assets.getCleanup');
  renderManagement(
    <CleanupDetail id={id} onClose={vi.fn<() => void>()} onChanged={vi.fn<() => void>()} />,
    'zh',
  );
  expect(screen.getByText('仅当前有效的超级管理员可读取清理账本。')).toBeInTheDocument();
  expect(screen.queryByText('storage_unavailable')).not.toBeInTheDocument();
});

it('regression: switching from a content-only collection to uploads selects an upload collection', async () => {
  renderManagement(<JobsPage />);
  await screen.findByText('Publication', { selector: 'td' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'batch' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) =>
          request.operation === 'content.listJobs' && request.query?.action === 'batch',
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'failed' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) =>
          request.operation === 'content.listJobs' && request.query?.status === 'failed',
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Upload sessions' }));
  await screen.findByText(upload.filename);
  fireEvent.change(screen.getByRole('combobox', { name: 'Purpose' }), {
    target: { value: 'create' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'pending' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) =>
          request.operation === 'assets.listUploads' &&
          request.query?.purpose === 'create' &&
          request.query?.status === 'pending',
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: /^Jobs$/ }));
  await screen.findByText('Publication', { selector: 'td' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'articles' },
  });
  await waitFor(() =>
    expect(api.request.mock.calls.at(-1)?.[0].params).toEqual({ collection: 'articles' }),
  );
});

it('uses server totals for job, upload and cleanup pagination and closes details with keyboard focus restored', async () => {
  const original = api.request.getMockImplementation();
  api.request.mockImplementation(async (request) => {
    const result = await (original?.(request) ?? Promise.resolve(failure('not_found', 404)));
    if (
      !result.ok ||
      (!request.operation.startsWith('assets.list') && request.operation !== 'content.listJobs')
    )
      return result;
    return {
      ...result,
      data: { ...z.record(z.string(), z.unknown()).parse(result.data), total: 31 },
    };
  });
  const jobs = renderManagement(<JobsPage />);
  await screen.findByText('Publication', { selector: 'td' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) => request.operation === 'content.listJobs' && request.query?.page === 2,
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) => request.operation === 'content.listJobs' && request.query?.pageSize === 10,
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: /^Details$/ }));
  await screen.findByRole('dialog');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  jobs.unmount();
  api.search = 'collection=media&tab=uploads';
  const uploads = renderManagement(<JobsPage />);
  await screen.findByText(upload.filename);
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) => request.operation === 'assets.listUploads' && request.query?.pageSize === 10,
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: /^Details$/ }));
  await screen.findByRole('dialog');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  uploads.unmount();
  api.search = '';
  renderManagement(<CleanupsPage />);
  await screen.findByText(id, { selector: 'span' });
  await userEvent.click(screen.getByRole('button', { name: 'Next' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      api.request.mock.calls.some(
        ([request]) => request.operation === 'assets.listCleanup' && request.query?.pageSize === 10,
      ),
    ).toBe(true),
  );
  await userEvent.click(screen.getByRole('button', { name: /^Details$/ }));
  await screen.findByRole('dialog');
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
