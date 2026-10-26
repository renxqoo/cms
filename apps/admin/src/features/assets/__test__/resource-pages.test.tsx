import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourcesPage } from '../resources-page';
import { ResourceUploadDialog } from '../resource-upload-dialog';
import {
  Harness,
  forbidden,
  json,
  requestUrl,
  resetUi,
  ui,
} from '../../../../test/support/admin-asset-ui';
import { collection, metadata, page, resource } from '../../../../test/support/admin-asset-data';
import { first, second, session, file, manifest } from '../../../../test/support/admin-asset-data';
import { uploadServices } from '../upload-requests';
import type { UploadProgress } from '../upload-requests';

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
const OriginalURL = URL;
const revoked = vi.fn<(url: string) => void>();
class BlobURL extends OriginalURL {
  static override createObjectURL = vi.fn<(value: Blob | MediaSource) => string>(
    () => 'blob:private',
  );
  static override revokeObjectURL = revoked;
}
let restoreUncertain = false;
let restored = false;
let deniedList = false;
function api(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = new OriginalURL(requestUrl(input), 'http://localhost');
  const { pathname, searchParams } = url;
  if (pathname.endsWith('/collections'))
    return Promise.resolve(
      json({ rows: [collection, { ...collection, key: 'pages', label: 'Pages', upload: false }] }),
    );
  if (pathname.endsWith('/editor')) return Promise.resolve(json(metadata));
  if (pathname.endsWith('/file'))
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3, 4]), {
        headers: {
          'content-type': 'image/png',
          'content-disposition': 'attachment; filename=image.png',
        },
      }),
    );
  if (pathname.endsWith('/references'))
    return Promise.resolve(
      json(page([{ collection: 'pages', id: second, versionId: first, sourcePath: 'en:hero' }])),
    );
  if (pathname.endsWith('/trash-restorations')) {
    if (restoreUncertain) {
      restoreUncertain = false;
      return Promise.reject(new Error('Lost response'));
    }
    restored = true;
    return Promise.resolve(json({ ...resource, revision: 10 }));
  }
  if (pathname.endsWith('/resources') || pathname.endsWith('/documents')) {
    if (deniedList) return Promise.resolve(forbidden());
    const trashed = searchParams.get('trashed') === 'true';
    const rows =
      restored && trashed
        ? []
        : [{ ...resource, ...(trashed ? { trashedAt: '2026-10-26T00:02:00.000Z' } : {}) }];
    return Promise.resolve(
      json(
        page(searchParams.get('page') === '2' ? [] : rows, 21, {
          page: Number(searchParams.get('page') ?? 1),
          pageSize: Number(searchParams.get('pageSize') ?? 20),
        }),
      ),
    );
  }
  if (pathname.endsWith('/uploads') && init?.method === 'POST')
    return Promise.resolve(json(session(), 201));
  if (pathname.endsWith('/completions'))
    return Promise.resolve(json(session({ status: 'processing', jobId: second }), 202));
  if (pathname.includes('/uploads/'))
    return Promise.resolve(json(session({ status: 'ready', manifest })));
  throw new Error(`Unexpected resource request: ${pathname}`);
}
beforeEach(() => {
  resetUi();
  restored = false;
  restoreUncertain = false;
  deniedList = false;
  fetcher.mockReset().mockImplementation(api);
  revoked.mockClear();
  vi.stubGlobal('URL', BlobURL);
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('URL', OriginalURL);
});

it('lists real upload collections, uses global resources queries and opens a version-pinned private preview', async () => {
  render(
    <Harness>
      <ResourcesPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'image.png' }));
  expect(await screen.findByRole('link', { name: 'Download file' })).toBeVisible();
  const download = fetcher.mock.calls.find(([input]) => requestUrl(input).includes('/file'));
  expect(
    new OriginalURL(requestUrl(download?.[0]), 'http://localhost').searchParams.get('versionId'),
  ).toBe(second);
  fireEvent.click(screen.getByRole('button', { name: 'View references' }));
  fireEvent.click(await screen.findByRole('button', { name: second }));
  expect(ui.push).toHaveBeenCalledWith(`/dashboard/collections/pages/${second}`);
  fireEvent.click(screen.getByRole('button', { name: 'Open document' }));
  expect(ui.push).toHaveBeenCalledWith(`/dashboard/collections/images/${first}`);
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(revoked).toHaveBeenCalledWith('blob:private'));
  expect(screen.queryByRole('option', { name: 'Pages' })).not.toBeInTheDocument();
});
it('combines collection, content locale, search and paging through actual whitelist queries', async () => {
  render(
    <Harness>
      <ResourcesPage />
    </Harness>,
  );
  await screen.findByRole('button', { name: 'image.png' });
  fireEvent.change(screen.getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'images' },
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) =>
        requestUrl(input).includes('/collections/images/documents'),
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Default language' }), {
    target: { value: 'zh-CN' },
  });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search records' }), {
    target: { value: 'hero' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) => {
        const query = new OriginalURL(requestUrl(input), 'http://localhost').searchParams;
        return query.get('locale') === 'zh-CN' && query.get('q') === 'hero';
      }),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([input]) =>
          new OriginalURL(requestUrl(input), 'http://localhost').searchParams.get('page') === '2',
      ),
    ).toBe(true),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Rows per page' }), {
    target: { value: '10' },
  });
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(
        ([input]) =>
          new OriginalURL(requestUrl(input), 'http://localhost').searchParams.get('pageSize') ===
          '10',
      ),
    ).toBe(true),
  );
});
it('restores a trashed resource with its expected revision and keeps the same intent after an unknown response', async () => {
  ui.search = 'collection=images&trashed=true';
  restoreUncertain = true;
  render(
    <Harness>
      <ResourcesPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'image.png' }));
  expect(screen.queryByRole('link', { name: 'Download file' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore resource' }));
  const dialogs = screen.getAllByRole('dialog');
  fireEvent.click(
    within(dialogs.at(-1) ?? document.body).getByRole('button', { name: 'Restore resource' }),
  );
  await screen.findByRole('button', { name: 'Continue checking' });
  const firstIntent = fetcher.mock.calls.find(([input]) =>
    requestUrl(input).endsWith('/trash-restorations'),
  )?.[1];
  const body = firstIntent?.body;
  expect(typeof body).toBe('string');
  expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({ revision: 9 });
  fireEvent.click(screen.getByRole('button', { name: 'Continue checking' }));
  await waitFor(() => expect(restored).toBe(true));
  const writes = fetcher.mock.calls.filter(([input]) =>
    requestUrl(input).endsWith('/trash-restorations'),
  );
  expect(new Headers(writes[0]?.[1]?.headers).get('idempotency-key')).toBe(
    new Headers(writes[1]?.[1]?.headers).get('idempotency-key'),
  );
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'image.png' })).not.toBeInTheDocument(),
  );
});
it('uploads real progress to a ready session without presenting it as an attached document', async () => {
  let progress: ((value: UploadProgress) => void) | null = null;
  const finished = new Promise<Awaited<ReturnType<typeof uploadServices.write>>>((resolve) => {
    vi.spyOn(uploadServices, 'write').mockImplementation((input) => {
      progress = input.onProgress;
      return new Promise((done) => {
        done({
          ok: true,
          status: 200,
          requestId: 'write',
          data: { uploadId: first, bytes: 4, digest: 'digest' },
        });
        resolve({
          ok: true,
          status: 200,
          requestId: 'write',
          data: { uploadId: first, bytes: 4, digest: 'digest' },
        });
      });
    });
  });
  render(
    <Harness>
      <ResourcesPage />
    </Harness>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Upload files' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('combobox', { name: 'Collection' }), {
    target: { value: 'images' },
  });
  await within(dialog).findByText('Drop files here, or choose local files');
  const metadataCall = fetcher.mock.calls.find(([input]) => requestUrl(input).includes('/editor'));
  expect(
    new OriginalURL(requestUrl(metadataCall?.[0]), 'http://localhost').searchParams.has('fallback'),
  ).toBe(false);
  fireEvent.change(within(dialog).getByLabelText('Choose files'), { target: { files: [file()] } });
  await finished;
  expect(progress).not.toBeNull();
  expect(
    await within(dialog).findByText(
      'The file is processed and ready. It has not been attached to a document.',
    ),
  ).toBeVisible();
  expect(within(dialog).queryByText('The file is attached to a document.')).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Create resource document' }));
  expect(ui.push).toHaveBeenCalledWith(`/dashboard/collections/images/new?uploadId=${first}`);
});
it('hides inaccessible resource data and exposes retryable read errors without stale previews', async () => {
  deniedList = true;
  const view = render(
    <Harness locale="zh">
      <ResourcesPage />
    </Harness>,
  );
  await screen.findByText('denied-request');
  expect(screen.queryByRole('button', { name: 'image.png' })).not.toBeInTheDocument();
  deniedList = false;
  fireEvent.click(screen.getAllByRole('button', { name: '重试' })[0] ?? document.body);
  expect(await screen.findByRole('button', { name: 'image.png' })).toBeVisible();
  ui.denied.add('resources.list');
  view.rerender(
    <Harness locale="zh">
      <ResourcesPage />
    </Harness>,
  );
  expect(screen.getByText('当前账号没有访问此功能的权限。')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'image.png' })).not.toBeInTheDocument();
});
it('regression: stale upload metadata cannot enable files while its authorized refresh fails', async () => {
  const props = {
    collections: [collection],
    initialCollection: collection.key,
    onClose: vi.fn<() => void>(),
    onStop: vi.fn<() => void>(),
    onActivityChange: vi.fn<(active: boolean) => void>(),
  };
  const content = () => (
    <Harness>
      <ResourceUploadDialog {...props} />
    </Harness>
  );
  const view = render(content());
  await waitFor(() => expect(screen.getByLabelText('Choose files')).toBeEnabled());
  ui.denied.add('collections.editor');
  view.rerender(content());
  fetcher.mockImplementation((input, init) =>
    requestUrl(input).includes('/editor')
      ? Promise.resolve(
          json(
            {
              error: {
                code: 'service_unavailable',
                message: 'Unavailable',
                requestId: 'metadata-refresh',
              },
            },
            503,
          ),
        )
      : api(input, init),
  );
  ui.denied.clear();
  view.rerender(content());
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
  await screen.findByText('metadata-refresh');
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
  expect(
    fetcher.mock.calls.filter(
      ([input, init]) => requestUrl(input).endsWith('/uploads') && init?.method === 'POST',
    ),
  ).toHaveLength(0);
});
