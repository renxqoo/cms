import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetPreview } from '../asset-preview';
import { first, manifest, second, deferred } from '../../../../test/support/admin-asset-data';
import { Harness, forbidden, resetUi, ui } from '../../../../test/support/admin-asset-ui';

vi.mock('../../access-control/provider', async () => {
  const support = await import('../../../../test/support/admin-asset-ui');
  return { useAccessControl: support.access };
});

const fetcher = vi.fn<typeof fetch>();
const created = vi.fn<(value: Blob | MediaSource) => string>();
const revoked = vi.fn<(url: string) => void>();
const OriginalURL = URL;
class BlobURL extends OriginalURL {
  static override createObjectURL = created;
  static override revokeObjectURL = revoked;
}
function bytes(type = 'image/png') {
  return new Response(new Uint8Array([1, 2, 3, 4]), {
    headers: {
      'content-type': type,
      'content-disposition': "attachment; filename*=UTF-8''private.png",
      etag: '"digest"',
    },
  });
}
beforeEach(() => {
  resetUi();
  created.mockReset().mockReturnValue('blob:private');
  revoked.mockClear();
  fetcher.mockReset().mockImplementation(() => Promise.resolve(bytes()));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('URL', BlobURL);
});
afterEach(() => {
  vi.stubGlobal('URL', OriginalURL);
});

it('fetches a precise historical binding through the authenticated BFF and revokes its URL on unmount', async () => {
  const view = render(
    <Harness>
      <AssetPreview
        target={{
          kind: 'binding',
          collection: 'pages',
          id: first,
          bindingId: second,
          versionId: first,
          mode: 'published',
          variant: 'thumb',
        }}
        label="Hero"
        manifest={manifest}
      />
    </Harness>,
  );
  expect(await screen.findByRole('img', { name: 'private.png' })).toHaveAttribute(
    'src',
    'blob:private',
  );
  const request = requestUrl(fetcher.mock.calls[0]?.[0]);
  expect(request).toContain(`/collections/pages/documents/${first}/media-bindings/${second}/file`);
  const query = new OriginalURL(request, 'http://localhost').searchParams;
  expect(query.get('versionId')).toBe(first);
  expect(query.get('mode')).toBe('published');
  expect(query.get('variant')).toBe('thumb');
  expect(screen.getByRole('link', { name: 'Download file' })).toHaveAttribute(
    'download',
    'private.png',
  );
  expect(created).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(revoked).toHaveBeenCalledExactlyOnceWith('blob:private');
});
it('revokes a previous preview when a variant or manifest changes and never uses a current fallback', async () => {
  const view = render(
    <Harness>
      <AssetPreview
        target={{
          kind: 'document',
          collection: 'images',
          id: first,
          versionId: second,
          mode: 'editing',
        }}
        label="File"
        manifest={manifest}
      />
    </Harness>,
  );
  await screen.findByRole('img');
  created.mockReturnValue('blob:variant');
  view.rerender(
    <Harness>
      <AssetPreview
        target={{
          kind: 'document',
          collection: 'images',
          id: first,
          versionId: second,
          mode: 'editing',
          variant: 'thumb',
        }}
        label="File"
        manifest={manifest}
      />
    </Harness>,
  );
  await waitFor(() => expect(screen.getByRole('img')).toHaveAttribute('src', 'blob:variant'));
  expect(revoked).toHaveBeenCalledWith('blob:private');
  expect(
    fetcher.mock.calls.every(
      ([url]) =>
        new OriginalURL(requestUrl(url), 'http://localhost').searchParams.get('versionId') ===
        second,
    ),
  ).toBe(true);
  view.unmount();
  expect(revoked).toHaveBeenCalledWith('blob:variant');
});
it('permission revocation hides private data and releases the active object URL', async () => {
  const target = {
    kind: 'document' as const,
    collection: 'images',
    id: first,
    mode: 'editing' as const,
  };
  const view = render(
    <Harness>
      <AssetPreview target={target} label="Secret" />
    </Harness>,
  );
  await screen.findByRole('img');
  ui.denied.add('assets.download');
  view.rerender(
    <Harness>
      <AssetPreview target={target} label="Secret" />
    </Harness>,
  );
  expect(await screen.findByText('This account cannot access this feature.')).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(revoked).toHaveBeenCalledWith('blob:private');
});
it('shows permission errors with request IDs and retries the same exact historical target', async () => {
  fetcher.mockImplementationOnce(() => Promise.resolve(forbidden()));
  render(
    <Harness>
      <AssetPreview
        target={{
          kind: 'binding',
          collection: 'pages',
          id: first,
          bindingId: second,
          versionId: first,
          mode: 'editing',
        }}
        label="Secret"
      />
    </Harness>,
  );
  expect(await screen.findByText('denied-request')).toBeVisible();
  expect(created).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('img');
  expect(fetcher.mock.calls[0]?.[0]).toBe(fetcher.mock.calls[1]?.[0]);
  expect(ui.report).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});
it.each(['application/pdf', 'image/svg+xml', 'text/html'])(
  'keeps potentially executable content out of embedded previews: %s',
  async (type) => {
    fetcher.mockImplementation(() => Promise.resolve(bytes(type)));
    render(
      <Harness locale="zh">
        <AssetPreview
          target={{ kind: 'document', collection: 'images', id: first, mode: 'editing' }}
          label="私有资源"
        />
      </Harness>,
    );
    expect(await screen.findByRole('link', { name: '下载文件' })).toBeVisible();
    expect(document.querySelector('img')).toBeNull();
    expect(document.querySelector('iframe,object,script')).toBeNull();
  },
);
it('cancels obsolete private downloads and ignores their late bytes after the target changes', async () => {
  const stale = deferred<Response>();
  fetcher.mockReturnValueOnce(stale.promise);
  const view = render(
    <Harness>
      <AssetPreview
        target={{ kind: 'document', collection: 'images', id: first, mode: 'editing' }}
        label="Old"
      />
    </Harness>,
  );
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  const signal = fetcher.mock.calls[0]?.[1]?.signal;
  view.rerender(
    <Harness>
      <AssetPreview
        target={{ kind: 'document', collection: 'images', id: second, mode: 'editing' }}
        label="New"
      />
    </Harness>,
  );
  await screen.findByRole('img');
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    stale.finish(bytes());
    await Promise.resolve();
  });
  expect(created).toHaveBeenCalledTimes(1);
});

function requestUrl(value: Parameters<typeof fetch>[0] | undefined) {
  if (typeof value === 'string') return value;
  if (value instanceof OriginalURL) return value.href;
  return value instanceof Request ? value.url : '';
}
