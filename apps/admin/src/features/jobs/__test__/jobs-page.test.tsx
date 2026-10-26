import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JobsPage } from '../jobs-page';
import {
  Harness,
  forbidden,
  json,
  requestUrl,
  resetUi,
  ui,
} from '../../../../test/support/admin-asset-ui';
import {
  collection,
  first,
  manifest,
  page,
  second,
  session,
} from '../../../../test/support/admin-asset-data';

vi.mock('../../access-control/provider', async () => {
  const support = await import('../../../../test/support/admin-asset-ui');
  return { useAccessControl: support.access };
});
vi.mock('../../../components/shell/navigation/provider', async () => {
  const { ui: state } = await import('../../../../test/support/admin-asset-ui');
  return {
    useAppNavigation: () => ({ adapter: state.adapter, push: state.push, replace: state.replace }),
  };
});
vi.mock('next/navigation', async () => {
  const { ui: state } = await import('../../../../test/support/admin-asset-ui');
  return { useSearchParams: () => new URLSearchParams(state.search) };
});
const fetcher = vi.fn<typeof fetch>();
const contentJob = {
  kind: 'content' as const,
  id: first,
  collection: 'images',
  action: 'publication' as const,
  status: 'queued' as const,
  documentId: second,
  expectedRevision: 9,
  requestedVersionId: second,
  executeAt: '2026-10-26T00:05:00.000Z',
  createdAt: '2026-10-26T00:00:00.000Z',
  finishedAt: null,
  total: 1,
  succeeded: 0,
  failed: 0,
};
const assetJob = {
  kind: 'asset' as const,
  id: second,
  collection: 'images',
  action: 'process' as const,
  status: 'running' as const,
  documentId: null,
  uploadId: first,
  attempts: 1,
  failureCode: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  finishedAt: null,
};
let failRead = false;
let terminal = false;
function api(input: Parameters<typeof fetch>[0]) {
  const url = new URL(requestUrl(input), 'http://localhost');
  if (url.pathname.endsWith('/collections'))
    return Promise.resolve(
      json({ rows: [collection, { ...collection, key: 'pages', label: 'Pages', upload: false }] }),
    );
  if (failRead) return Promise.resolve(forbidden());
  if (url.pathname.endsWith('/jobs'))
    return Promise.resolve(
      json(
        page([contentJob, assetJob], 21, {
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 20),
        }),
      ),
    );
  if (url.pathname.endsWith(`/jobs/${first}`))
    return Promise.resolve(
      json({
        ...contentJob,
        status: terminal ? 'succeeded' : 'queued',
        succeeded: terminal ? 1 : 0,
        items: [{ position: 0, id: second, status: terminal ? 'succeeded' : 'queued' }],
      }),
    );
  if (url.pathname.endsWith(`/jobs/${second}`))
    return Promise.resolve(json({ ...assetJob, manifest, uploadId: first }));
  if (url.pathname.endsWith('/uploads')) {
    const { manifest: _manifest, ...summary } = session({ status: 'ready' });
    return Promise.resolve(
      json(
        page([summary], 21, {
          page: Number(url.searchParams.get('page') ?? 1),
          pageSize: Number(url.searchParams.get('pageSize') ?? 20),
        }),
      ),
    );
  }
  if (url.pathname.endsWith(`/uploads/${first}`))
    return Promise.resolve(json(session({ status: 'ready', manifest })));
  throw new Error(`Unexpected work request: ${url.pathname}`);
}
beforeEach(() => {
  resetUi();
  failRead = false;
  terminal = false;
  fetcher.mockReset().mockImplementation(api);
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => vi.useRealTimers());

it('discovers content and asset jobs, applies real filters and shows kind-specific details', async () => {
  ui.search = 'collection=images';
  render(
    <Harness>
      <JobsPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: first }));
  const detail = screen.getByRole('dialog');
  expect(await within(detail).findByRole('columnheader', { name: 'Document ID' })).toBeVisible();
  expect(within(detail).getByText('Scheduled publication')).toBeVisible();
  fireEvent.click(within(detail).getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: second }));
  expect(await within(screen.getByRole('dialog')).findByText('Attempts')).toBeVisible();
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Action' }), {
    target: { value: 'publication' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), {
    target: { value: 'queued' },
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) => {
        const search = new URL(requestUrl(input), 'http://localhost').searchParams;
        return search.get('action') === 'publication' && search.get('status') === 'queued';
      }),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([input]) =>
          new URL(requestUrl(input), 'http://localhost').searchParams.get('page') === '2',
      ),
    ).toBe(true),
  );
});
it('lists recovered upload sessions separately and connects ready create sessions to the real new-document flow', async () => {
  ui.search = 'view=uploads&collection=images';
  render(
    <Harness>
      <JobsPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'image.png' }));
  const dialog = screen.getByRole('dialog');
  expect(
    await within(dialog).findByText(
      'The file is processed and ready. It has not been attached to a document.',
    ),
  ).toBeVisible();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create resource document' }));
  expect(ui.push).toHaveBeenCalledWith(`/dashboard/collections/images/new?uploadId=${first}`);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Purpose' }), {
    target: { value: 'replace' },
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([input]) =>
          new URL(requestUrl(input), 'http://localhost').searchParams.get('purpose') === 'replace',
      ),
    ).toBe(true),
  );
  expect(screen.queryByRole('option', { name: 'Pages' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Jobs and uploads' }), {
    target: { value: 'jobs' },
  });
  expect(await screen.findByRole('option', { name: 'Pages' })).toBeVisible();
});
it('does not issue work queries until a real catalog collection is chosen', async () => {
  render(
    <Harness locale="zh">
      <JobsPage />
    </Harness>,
  );
  expect(await screen.findByRole('option', { name: 'Images' })).toBeInTheDocument();
  expect(fetcher.mock.calls.some(([input]) => requestUrl(input).includes('/jobs'))).toBe(false);
  fireEvent.change(screen.getByRole('combobox', { name: '集合' }), { target: { value: 'images' } });
  expect(await screen.findByRole('button', { name: first })).toBeVisible();
});
it('bounds list and selected-detail polling independently, stops terminal details and cleans up on leave', async () => {
  vi.useFakeTimers();
  ui.search = `collection=images&selected=${first}`;
  const view = render(
    <Harness>
      <JobsPage />
    </Harness>,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(within(screen.getByRole('dialog')).getByText('Scheduled publication')).toBeVisible();
  const count = (part: string) =>
    fetcher.mock.calls.filter(([input]) =>
      new URL(requestUrl(input), 'http://localhost').pathname.endsWith(part),
    ).length;
  expect(count('/jobs')).toBe(1);
  expect(count(`/jobs/${first}`)).toBe(1);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(count('/jobs')).toBe(1);
  expect(count(`/jobs/${first}`)).toBe(2);
  terminal = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(count('/jobs')).toBe(2);
  expect(count(`/jobs/${first}`)).toBe(3);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(5000);
  });
  expect(count(`/jobs/${first}`)).toBe(3);
  view.unmount();
  const before = fetcher.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(fetcher).toHaveBeenCalledTimes(before);
});
it('shows retryable work errors and disables unavailable detail reads', async () => {
  ui.search = 'collection=images';
  failRead = true;
  const view = render(
    <Harness>
      <JobsPage />
    </Harness>,
  );
  expect(await screen.findByText('denied-request')).toBeVisible();
  failRead = false;
  fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0] ?? document.body);
  await screen.findByRole('button', { name: first });
  ui.denied.add('content.getJob');
  fireEvent.click(screen.getByRole('button', { name: first }));
  expect(
    await within(screen.getByRole('dialog')).findByText('This account cannot access this feature.'),
  ).toBeVisible();
  expect(fetcher.mock.calls.some(([input]) => requestUrl(input).endsWith(`/jobs/${first}`))).toBe(
    false,
  );
  view.unmount();
  ui.denied.add('content.listJobs');
  render(
    <Harness>
      <JobsPage />
    </Harness>,
  );
  expect(await screen.findByText('This account cannot access this feature.')).toBeVisible();
});
