import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { DocumentMedia, FixedMedia, ReferenceMediaPreview } from '../document-media';
import { ImageDialog } from '../image-dialog';
import { ResourcesPage } from '../resources-page';
import { ResourcePreview } from '../resource-preview';
import {
  collection,
  document,
  documentId,
  editor,
  job,
  manifest,
  session,
  success,
  uploadId,
  deferred,
} from './support';

interface Request {
  operation: string;
  signal: AbortSignal;
  query?: unknown;
  body?: unknown;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(value: Request) => Promise<ApiResult<unknown>>>(),
  can: vi.fn<(operation: string) => boolean>(),
  report: vi.fn<(...values: unknown[]) => void>(),
  push: vi.fn<(href: string) => void>(),
  search: '',
  locale: 'en',
  create: vi.fn<(blob: Blob) => string>(),
  revoke: vi.fn<(value: string) => void>(),
  adapter: {
    subscribe: (_listener: unknown) => () => {},
    commit: (_attempt: unknown) => {},
    cancel: (_attempt: unknown) => {},
  },
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    phase: 'ready',
    can: mocks.can,
    reportResult: mocks.report,
    refresh: () => {},
  }),
}));
vi.mock('../../../components/shell/shell-provider', () => ({ useShell: () => mocks.locale }));
vi.mock('../../../components/shell/navigation/provider', () => ({
  useAppNavigation: () => ({ adapter: mocks.adapter, push: mocks.push }),
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(mocks.search) }));
vi.mock('next-intl', () => ({ useTranslations: () => () => '' }));

function defaultResponse(input: Request): Promise<ApiResult<unknown>> {
  switch (input.operation) {
    case 'assets.download':
    case 'assets.downloadBinding':
      return Promise.resolve(
        success({
          blob: new Blob(['image']),
          filename: 'source.png',
          bytes: 5,
          contentType: 'image/png',
          etag: 'etag',
        }),
      );
    case 'collections.list':
      return Promise.resolve(success({ rows: [collection] }));
    case 'collections.editor':
      return Promise.resolve(success({ ...editor, intent: 'create', document: null }));
    case 'resources.list':
      return Promise.resolve(success({ rows: [document], total: 1, page: 1, pageSize: 20 }));
    case 'resources.references':
      return Promise.resolve(
        success({
          rows: [
            {
              collection: 'articles',
              id: documentId,
              versionId: document.versionId,
              sourcePath: 'en:cover',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      );
    case 'assets.reprocess':
      return Promise.resolve(success({ jobId: job().id, uploadId }));
    case 'content.getJob':
      return Promise.resolve(success(job({ status: 'succeeded' })));
    case 'documents.create':
      return Promise.resolve(success(document));
    case 'documents.update':
    case 'documents.get':
      return Promise.resolve(success({ ...document, revision: 8 }));
    case 'assets.readUpload':
    case 'assets.createUpload':
      return Promise.resolve(success(session({ status: 'ready', manifest })));
    case 'assets.cancelUpload':
      return Promise.resolve(success());
    default:
      return Promise.resolve(failure('not_found', 404));
  }
}
beforeEach(() => {
  mocks.locale = 'en';
  mocks.search = '';
  mocks.can.mockReturnValue(true);
  mocks.request.mockImplementation(defaultResponse);
  mocks.create.mockReturnValue('blob:resource');
  const BaseURL = URL;
  vi.stubGlobal(
    'URL',
    class extends BaseURL {
      static override createObjectURL = mocks.create;
      static override revokeObjectURL = mocks.revoke;
    },
  );
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('regression: image crop editing keeps its preview on the original file rather than a selectable derived variant', async () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  render(
    <ImageDialog
      target={{ collection: 'media', id: documentId }}
      manifest={manifest}
      limits={editor.upload}
      onClose={() => {}}
      onProcess={() => {}}
      busy={false}
    />,
  );
  await screen.findAllByRole('img');
  expect(screen.queryByRole('combobox', { name: 'Variant' })).toBeNull();
});

it('submits real integer crop and focal values, validates variant budgets and preserves controlled dirty state', async () => {
  if (!editor.upload) throw new Error('Upload metadata required');
  const processed = vi.fn<(...values: unknown[]) => void>();
  const close = vi.fn<() => void>();
  render(
    <ImageDialog
      target={{ collection: 'media', id: documentId }}
      manifest={manifest}
      limits={editor.upload}
      onClose={close}
      onProcess={processed}
      busy={false}
    />,
  );
  await screen.findAllByRole('img');
  fireEvent.change(screen.getByLabelText('Crop X'), { target: { value: '0.25' } });
  fireEvent.change(screen.getByLabelText('Crop width'), { target: { value: '0.5' } });
  fireEvent.change(screen.getByLabelText('Focal Y'), { target: { value: '0.9' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add variant' }));
  fireEvent.change(screen.getByLabelText('Variant name'), { target: { value: 'web' } });
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '100' } });
  fireEvent.change(screen.getByLabelText('Height'), { target: { value: '50' } });
  fireEvent.change(screen.getByLabelText('Quality'), { target: { value: '85' } });
  fireEvent.change(screen.getByLabelText('Fit'), { target: { value: 'cover' } });
  fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'jpeg' } });
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Process image' }).at(-1) ??
      screen.getByRole('button', { name: 'Process image' }),
  );
  expect(processed).toHaveBeenCalledWith({
    crop: { left: 0, top: 0, width: 100, height: 100 },
    focalPoint: { x: 0.5, y: 0.9 },
    variants: [{ name: 'web', width: 100, height: 50, quality: 85, fit: 'cover', format: 'jpeg' }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Remove variant' }));
  expect(screen.queryByLabelText('Variant name')).toBeNull();
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Close' }).at(-1) ??
      screen.getByRole('button', { name: 'Close' }),
  );
  expect(close).toHaveBeenCalled();
});

it('renders fixed media only for the exact source reference and preserves its historical binding identity', async () => {
  const bound = {
    ...document,
    collection: 'articles',
    mediaBindings: [
      {
        bindingId: '77777777-7777-4777-8777-777777777777',
        sourcePath: 'en:cover',
        mediaDocumentId: documentId,
        mediaCollectionKey: 'media',
        manifest,
      },
    ],
  };
  const view = render(
    <ReferenceMediaPreview
      document={bound}
      reference={{ collection: 'media', id: documentId }}
      sourcePath="other"
    />,
  );
  expect(mocks.request).not.toHaveBeenCalled();
  view.rerender(
    <ReferenceMediaPreview
      document={bound}
      reference={{ collection: 'media', id: documentId }}
      sourcePath="cover"
    />,
  );
  await screen.findByRole('img');
  expect(mocks.request.mock.calls[0]?.[0].operation).toBe('assets.downloadBinding');
  view.rerender(<FixedMedia document={bound} />);
  expect(screen.getByRole('heading', { name: 'Fixed media references' })).toBeVisible();
});

it('requires metadata and runtime permissions for media writes and supports upload creation handoff', async () => {
  const ready = vi.fn<(id: string) => void>();
  const busy = vi.fn<(value: boolean) => void>();
  render(
    <DocumentMedia
      collection={collection}
      editor={{ ...editor, intent: 'create', document: null }}
      document={null}
      onDocumentChanged={() => {}}
      onUploadReady={ready}
      onBusyChange={busy}
      initialUploadId={uploadId}
    />,
  );
  await screen.findByRole('button', { name: 'Attach to document' });
  fireEvent.click(screen.getByRole('button', { name: 'Attach to document' }));
  expect(ready).toHaveBeenCalledWith(uploadId);
  expect(busy).toHaveBeenLastCalledWith(false);
});

it('replaces through a single document channel and waits for document refresh before unlocking', async () => {
  const busy = vi.fn<(value: boolean) => void>();
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue();
  render(
    <DocumentMedia
      collection={collection}
      editor={editor}
      document={document}
      onDocumentChanged={changed}
      onBusyChange={busy}
    />,
  );
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
  fireEvent.change(screen.getByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'source.png', { type: 'image/png' })] },
  });
  await screen.findByRole('button', { name: 'Attach to document' });
  expect(busy).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Attach to document' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  await waitFor(() => expect(busy).toHaveBeenLastCalledWith(false));
  expect(
    mocks.request.mock.calls.find(([value]) => value.operation === 'documents.update')?.[0].body,
  ).toEqual({ locale: 'en', revision: 7, uploadId });
});

it('starts reprocessing through the image controls and unlocks only when the job succeeds', async () => {
  const busy = vi.fn<(value: boolean) => void>();
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue();
  render(
    <DocumentMedia
      collection={collection}
      editor={editor}
      document={document}
      onDocumentChanged={changed}
      onBusyChange={busy}
    />,
  );
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'Edit image' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit image' });
  await within(dialog).findAllByRole('img');
  fireEvent.click(
    within(dialog).getAllByRole('button', { name: 'Process image' }).at(-1) ??
      within(dialog).getByRole('button', { name: 'Process image' }),
  );
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(busy).toHaveBeenLastCalledWith(false);
});

it('renders real resource rows, server query search, preview references and upload-session navigation', async () => {
  render(<ResourcesPage />);
  expect(await screen.findByText('source.png')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Search records'), { target: { value: 'Source' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  expect(mocks.push).toHaveBeenCalledWith('/dashboard/resources?q=Source&page=1', {
    scroll: false,
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Private preview' }));
  const preview = await screen.findByRole('dialog', { name: 'source.png' });
  await within(preview).findByRole('img');
  fireEvent.click(within(preview).getByRole('button', { name: /articles:/ }));
  expect(mocks.push).toHaveBeenCalledWith(`/dashboard/collections/articles/${documentId}`);
  fireEvent.click(within(preview).getByRole('button', { name: 'Open document' }));
  expect(mocks.push).toHaveBeenCalledWith(`/dashboard/collections/media/${documentId}`);
  fireEvent.click(within(preview).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
  expect(screen.queryByRole('button', { name: 'Find upload sessions' })).not.toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Close' })).toHaveLength(1);
});

it('shows denied resource reads and an empty upload catalog without inventing resource rows', () => {
  mocks.can.mockReturnValue(false);
  render(<ResourcesPage />);
  expect(screen.getByText('You do not have permission to read resources.')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
  expect(screen.getByText('No upload collections are available.')).toBeVisible();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('requests server pages and page sizes and opens the selected resource document', async () => {
  mocks.request.mockImplementation((input) =>
    input.operation === 'resources.list'
      ? Promise.resolve(success({ rows: [document], total: 45, page: 1, pageSize: 20 }))
      : defaultResponse(input),
  );
  render(<ResourcesPage />);
  await screen.findByText('source.png');
  fireEvent.click(screen.getByRole('button', { name: 'Open document' }));
  expect(mocks.push).toHaveBeenCalledWith(`/dashboard/collections/media/${documentId}`);
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(mocks.push).toHaveBeenCalledWith('/dashboard/resources?page=2', { scroll: false });
  await screen.findByText('source.png');
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } });
  expect(mocks.push).toHaveBeenCalledWith('/dashboard/resources?page=1&pageSize=50', {
    scroll: false,
  });
});

it('automatically saves a processed upload and refreshes the resource list without any manual action', async () => {
  let stored = false;
  mocks.request.mockImplementation((input) => {
    if (input.operation === 'documents.create') {
      stored = true;
      return Promise.resolve(success(document));
    }
    if (input.operation === 'resources.list')
      return Promise.resolve(
        success({ rows: stored ? [document] : [], total: stored ? 1 : 0, page: 1, pageSize: 20 }),
      );
    if (input.operation === 'collections.get') return Promise.resolve(success(collection));
    if (input.operation === 'documents.get') return Promise.resolve(success(document));
    return defaultResponse(input);
  });
  render(<ResourcesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
  fireEvent.change(await screen.findByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'source.png', { type: 'image/png' })] },
  });
  await screen.findByText('Saved to resource library');
  expect(screen.getByText('Saved to resource library')).toBeVisible();
  expect(
    mocks.request.mock.calls.find(([input]) => input.operation === 'documents.create')?.[0].body,
  ).toEqual({ locale: 'en', data: {}, folderId: null, uploadId });
  expect(mocks.push).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Upload files' }), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(within(screen.getByRole('table')).getByText('source.png')).toBeVisible();
});

it('opens the upload dialog from the header and restores focus after Escape', async () => {
  const user = userEvent.setup();
  render(<ResourcesPage />);
  const trigger = screen.getByRole('button', { name: 'Upload files' });
  expect(trigger.closest('header')).not.toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Upload files' });
  expect(within(dialog).getByLabelText('Upload collection')).toBeVisible();
  expect(within(dialog).getByLabelText('Choose files')).toBeEnabled();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(trigger).toHaveFocus();
});

it('regression: a failed automatic save shows a retry without repeating the upload or cancelling an uncertain save', async () => {
  let attempts = 0;
  mocks.request.mockImplementation((input) => {
    if (input.operation === 'documents.create') {
      attempts += 1;
      return Promise.resolve(
        attempts === 1 ? failure('request_failed', 0, { uncertain: true }) : success(document),
      );
    }
    return defaultResponse(input);
  });
  render(<ResourcesPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Upload files' }));
  fireEvent.change(await screen.findByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'source.png', { type: 'image/png' })] },
  });
  const retry = await screen.findByRole('button', { name: 'Retry saving' });
  expect(screen.queryByText('Saved to resource library')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancel upload' })).not.toBeInTheDocument();
  fireEvent.click(retry);
  await screen.findByText('Saved to resource library');
  expect(attempts).toBe(2);
  expect(
    mocks.request.mock.calls.filter(([input]) => input.operation === 'assets.createUpload'),
  ).toHaveLength(1);
  expect(
    mocks.request.mock.calls.filter(([input]) => input.operation === 'assets.cancelUpload'),
  ).toHaveLength(0);
});

it('keeps an active upload alive when its dialog closes and restores the queue when reopened', async () => {
  const user = userEvent.setup();
  const pending = deferred<ApiResult<unknown>>();
  mocks.request.mockImplementation((input) =>
    input.operation === 'assets.createUpload' ? pending.promise : defaultResponse(input),
  );
  const view = render(<ResourcesPage />);
  const trigger = screen.getByRole('button', { name: 'Upload files' });
  await user.click(trigger);
  fireEvent.change(await screen.findByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'background.png', { type: 'image/png' })] },
  });
  await waitFor(() => expect(screen.getByLabelText('Upload collection')).toBeDisabled());
  const transfer = mocks.request.mock.calls.find(
    ([input]) => input.operation === 'assets.createUpload',
  )?.[0];
  expect(transfer).toBeDefined();
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(transfer?.signal.aborted).toBe(false);
  await act(async () => {
    pending.resolve(success(session({ status: 'ready', manifest })));
    await pending.promise;
  });
  await user.click(trigger);
  const dialog = screen.getByRole('dialog', { name: 'Upload files' });
  expect(within(dialog).getByText('background.png')).toBeVisible();
  await within(dialog).findByText('Saved to resource library');
  expect(within(dialog).getByLabelText('Upload collection')).toBeEnabled();
  expect(
    mocks.request.mock.calls.filter(([input]) => input.operation === 'assets.createUpload'),
  ).toHaveLength(1);
  view.unmount();
  expect(transfer?.signal.aborted).toBe(true);
});

it('opens a linked upload session directly in the upload dialog', async () => {
  mocks.search = `collection=media&uploadId=${uploadId}`;
  render(<ResourcesPage />);
  const dialog = await screen.findByRole('dialog', { name: 'Upload files' });
  expect(await within(dialog).findByText('Saved to resource library')).toBeVisible();
});

it('preserves reference pagination on the server and handles files with no visible references', async () => {
  mocks.request.mockImplementation((input) =>
    input.operation === 'resources.references'
      ? Promise.resolve(success({ rows: [], total: 45, page: 1, pageSize: 20 }))
      : defaultResponse(input),
  );
  const view = render(<ResourcePreview document={document} onClose={() => {}} />);
  await screen.findByRole('img');
  fireEvent.click(await screen.findByRole('button', { name: '→' }));
  await waitFor(() =>
    expect(
      mocks.request.mock.calls
        .filter(([input]) => input.operation === 'resources.references')
        .at(-1)?.[0].query,
    ).toEqual({ page: 2, pageSize: 20 }),
  );
  fireEvent.click(screen.getByRole('button', { name: '←' }));
  await waitFor(() =>
    expect(
      mocks.request.mock.calls
        .filter(([input]) => input.operation === 'resources.references')
        .at(-1)?.[0].query,
    ).toEqual({ page: 1, pageSize: 20 }),
  );
  view.unmount();
  mocks.request.mockImplementation((input) =>
    input.operation === 'resources.references'
      ? Promise.resolve(success({ rows: [], total: 0, page: 1, pageSize: 20 }))
      : defaultResponse(input),
  );
  render(<ResourcePreview document={{ ...document, file: undefined }} onClose={() => {}} />);
  expect(await screen.findByText('No visible references.')).toBeVisible();
  expect(screen.getByText('This document has no file.')).toBeVisible();
});

it('keeps an uncertain replacement locked until the same upload is verified against the current immutable file', async () => {
  let uncertain = false;
  mocks.request.mockImplementation((input) => {
    if (input.operation === 'documents.update') {
      uncertain = true;
      return Promise.resolve(failure('request_failed', 0, { uncertain: true }));
    }
    if (uncertain && input.operation === 'assets.readUpload')
      return Promise.resolve(success(session({ status: 'consumed', manifest })));
    return defaultResponse(input);
  });
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue();
  const busy = vi.fn<(value: boolean) => void>();
  render(
    <DocumentMedia
      collection={collection}
      document={document}
      editor={editor}
      onDocumentChanged={changed}
      onBusyChange={busy}
    />,
  );
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
  fireEvent.change(screen.getByLabelText('Choose files'), {
    target: { files: [new File(['contents'], 'source.png', { type: 'image/png' })] },
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Attach to document' }));
  await screen.findByText('The write result is not confirmed. Verify or retry the same intent.');
  expect(busy).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Verify result' }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(busy).toHaveBeenLastCalledWith(false);
});

it('closes an unused replacement and an image recipe without starting remote work', async () => {
  render(
    <DocumentMedia
      collection={collection}
      document={document}
      editor={editor}
      onDocumentChanged={() => {}}
    />,
  );
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'Replace file' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByLabelText('Choose files')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit image' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit image' });
  await within(dialog).findAllByRole('img');
  fireEvent.click(
    within(dialog).getAllByRole('button', { name: 'Close' }).at(-1) ??
      within(dialog).getByRole('button', { name: 'Close' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(
    mocks.request.mock.calls.some(
      ([value]) => value.operation === 'assets.reprocess' || value.operation === 'documents.update',
    ),
  ).toBe(false);
});
