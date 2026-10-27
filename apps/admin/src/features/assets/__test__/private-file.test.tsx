import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { PrivateFile, PrivateThumbnail } from '../private-file';
import { documentId, manifest, versionId, deferred, success } from './support';

interface Request {
  operation: string;
  query?: unknown;
  params?: unknown;
  signal: AbortSignal;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(value: Request) => Promise<ApiResult<unknown>>>(),
  can: vi.fn<() => boolean>(),
  report: vi.fn<(...values: unknown[]) => void>(),
  create: vi.fn<(blob: Blob) => string>(),
  revoke: vi.fn<(url: string) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ can: mocks.can, reportResult: mocks.report }),
}));
vi.mock('../../../components/shell/shell-provider', () => ({ useShell: () => 'en' }));
beforeEach(() => {
  mocks.can.mockReturnValue(true);
  mocks.create.mockReturnValue('blob:private-original');
  mocks.request.mockResolvedValue(
    success({
      blob: new Blob(['png']),
      filename: 'source.png',
      bytes: 3,
      contentType: 'image/png',
      etag: 'etag',
    }),
  );
  const OriginalURL = URL;
  vi.stubGlobal(
    'URL',
    class extends OriginalURL {
      static override createObjectURL = mocks.create;
      static override revokeObjectURL = mocks.revoke;
    },
  );
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('loads the smallest authorized thumbnail variant and releases its private Blob on unmount', async () => {
  const view = render(
    <PrivateThumbnail
      target={{ collection: 'articles', id: documentId, bindingId: versionId, versionId }}
      manifest={manifest}
    />,
  );
  expect(await screen.findByRole('img', { name: 'source.png' })).toHaveAttribute(
    'src',
    'blob:private-original',
  );
  expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'assets.downloadBinding',
    query: { variant: 'thumb', versionId },
  });
  view.unmount();
  expect(mocks.revoke).toHaveBeenCalledWith('blob:private-original');
});

it('keeps denied thumbnails out of the page and permits retry after a failed private download', async () => {
  mocks.can.mockReturnValue(false);
  const denied = render(
    <PrivateThumbnail target={{ collection: 'media', id: documentId }} manifest={manifest} />,
  );
  expect(mocks.request).not.toHaveBeenCalled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  denied.unmount();
  mocks.can.mockReturnValue(true);
  mocks.request.mockResolvedValueOnce(failure('temporarily_unavailable', 503));
  render(<PrivateThumbnail target={{ collection: 'media', id: documentId }} manifest={manifest} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Refresh source.png' }));
  expect(await screen.findByRole('img', { name: 'source.png' })).toBeVisible();
  expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ ok: false, status: 503 }));
});

it('reads fixed historical bytes through the source binding and revokes each Blob after variant change and unmount', async () => {
  const view = render(
    <PrivateFile
      target={{
        collection: 'articles',
        id: documentId,
        versionId,
        bindingId: '77777777-7777-4777-8777-777777777777',
      }}
      manifest={manifest}
    />,
  );
  expect(await screen.findByRole('img', { name: 'source.png' })).toHaveAttribute(
    'src',
    'blob:private-original',
  );
  expect(mocks.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'assets.downloadBinding',
    params: {
      collection: 'articles',
      id: documentId,
      bindingId: '77777777-7777-4777-8777-777777777777',
    },
    query: { versionId, mode: 'editing', variant: 'original' },
  });
  mocks.create.mockReturnValue('blob:private-thumb');
  mocks.request.mockResolvedValueOnce(
    success({
      blob: new Blob(['webp']),
      filename: 'source-thumb.webp',
      bytes: 4,
      contentType: 'image/webp',
      etag: 'variant',
    }),
  );
  fireEvent.change(screen.getByLabelText('Variant'), { target: { value: 'thumb' } });
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:private-thumb'));
  expect(mocks.revoke).toHaveBeenCalledWith('blob:private-original');
  expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute(
    'download',
    'source-thumb.webp',
  );
  view.unmount();
  expect(mocks.revoke).toHaveBeenCalledWith('blob:private-thumb');
});

it('does not inject executable file formats and offers authenticated downloaded bytes instead', async () => {
  const pdf = {
    ...manifest,
    filename: 'document.pdf',
    mimeType: 'application/pdf',
    objects: [
      {
        ...manifest.objects[0],
        name: 'original',
        bytes: 8,
        digest: 'pdf',
        mimeType: 'application/pdf',
        width: null,
        height: null,
      },
    ],
  };
  render(<PrivateFile target={{ collection: 'media', id: documentId }} manifest={pdf} />);
  expect(await screen.findByText('Use Download to open this file.')).toBeVisible();
  expect(screen.queryByRole('img')).toBeNull();
  expect(document.querySelector('iframe,object,embed')).toBeNull();
});

it('regression: denied reference downloads explain preview permission without requesting upload access', () => {
  mocks.can.mockReturnValue(false);
  render(
    <PrivateFile
      target={{ collection: 'articles', id: documentId, versionId, bindingId: documentId }}
      manifest={manifest}
    />,
  );
  expect(
    screen.getByText('You do not have permission to preview or download this file.'),
  ).toBeVisible();
  expect(screen.queryByText('Upload and result-reading permissions are required.')).toBeNull();
  expect(screen.queryByRole('link', { name: 'Download original' })).toBeNull();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('revokes stale preview bytes immediately after local authorization is withdrawn', async () => {
  const target = { collection: 'media', id: documentId };
  const view = render(<PrivateFile target={target} manifest={manifest} />);
  await screen.findByRole('img');
  mocks.can.mockReturnValue(false);
  view.rerender(<PrivateFile target={target} manifest={manifest} />);
  expect(screen.queryByRole('img')).toBeNull();
  expect(mocks.revoke).toHaveBeenCalledWith('blob:private-original');
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it('keeps forbidden download semantics and request IDs visible and permits explicit retry', async () => {
  mocks.request.mockResolvedValueOnce({
    ...failure('forbidden', 403, { requestId: 'private-request' }),
    retryAfterSeconds: 30,
  });
  render(<PrivateFile target={{ collection: 'media', id: documentId }} manifest={manifest} />);
  expect(await screen.findByText('private-request')).toBeVisible();
  expect(screen.getByText(/30/)).toBeVisible();
  expect(mocks.report).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('img')).toBeVisible();
});

it('aborts an unmounted file request and refuses to allocate a Blob for a late response', async () => {
  const result = deferred<ApiResult<unknown>>();
  mocks.request.mockReturnValue(result.promise);
  const view = render(
    <PrivateFile target={{ collection: 'media', id: documentId }} manifest={manifest} />,
  );
  view.unmount();
  expect(mocks.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  await act(async () => {
    result.resolve(success({ blob: new Blob(['late']) }));
    await result.promise;
  });
  expect(mocks.create).not.toHaveBeenCalled();
});
it('regression: non-image resource thumbnails do not download invisible file bytes', () => {
  const pdf = {
    ...manifest,
    mimeType: 'application/pdf',
    filename: 'private.pdf',
    objects: manifest.objects
      .filter((object) => object.name === 'original')
      .map((object) => ({ ...object, mimeType: 'application/pdf' })),
  };
  render(<PrivateThumbnail target={{ collection: 'media', id: documentId }} manifest={pdf} />);
  expect(mocks.request).not.toHaveBeenCalled();
  expect(mocks.create).not.toHaveBeenCalled();
});
it('regression: a replacement manifest selects its available thumbnail after its old variant has been removed', async () => {
  const view = render(
    <PrivateThumbnail target={{ collection: 'media', id: documentId }} manifest={manifest} />,
  );
  await screen.findByRole('img');
  view.rerender(
    <PrivateThumbnail
      target={{ collection: 'media', id: documentId }}
      manifest={{
        ...manifest,
        id: '88888888-8888-4888-8888-888888888888',
        objects: manifest.objects.filter((object) => object.name === 'original'),
      }}
    />,
  );
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(mocks.request.mock.lastCall?.[0].query).toMatchObject({ variant: 'original' });
});
it('regression: a private derived download uses the server filename and true output extension', async () => {
  render(<PrivateFile target={{ collection: 'media', id: documentId }} manifest={manifest} />);
  await screen.findByRole('img');
  mocks.request.mockResolvedValueOnce(
    success({
      blob: new Blob(['webp']),
      filename: 'source-thumb.webp',
      bytes: 4,
      contentType: 'image/webp',
      etag: 'variant',
    }),
  );
  fireEvent.change(screen.getByLabelText('Variant'), { target: { value: 'thumb' } });
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('link', { name: 'Download original' })).toHaveAttribute(
    'download',
    'source-thumb.webp',
  );
});
