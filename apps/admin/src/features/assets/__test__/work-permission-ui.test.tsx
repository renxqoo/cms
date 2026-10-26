import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetDocumentControls } from '../asset-document-controls';
import { Harness, json, requestUrl, resetUi, ui } from '../../../../test/support/admin-asset-ui';
import {
  budget,
  first,
  manifest,
  ok,
  second,
  session,
} from '../../../../test/support/admin-asset-data';
import type { AssetWriteLease } from '../document-asset-types';

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
const fetcher = vi.fn<typeof fetch>();
const finish = vi.fn<AssetWriteLease['finish']>();
const refresh = vi.fn<AssetWriteLease['refresh']>();
const OriginalURL = URL;
class BlobURL extends OriginalURL {
  static override createObjectURL = () => 'blob:private';
  static override revokeObjectURL = () => {};
}
let unknown = true;
let done = false;
function api(input: Parameters<typeof fetch>[0]) {
  const path = new OriginalURL(requestUrl(input), 'http://localhost').pathname;
  if (path.endsWith('/file'))
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'image/png' } }),
    );
  if (path.endsWith('/file-processings'))
    return unknown
      ? Promise.reject(new Error('Lost receipt'))
      : Promise.resolve(json({ jobId: second, uploadId: first }, 202));
  if (path.endsWith(`/jobs/${second}`))
    return Promise.resolve(
      json({
        id: second,
        collection: 'images',
        action: 'reprocess',
        status: done ? 'succeeded' : 'running',
        attempts: 1,
        failureCode: null,
        uploadId: first,
        manifest: done ? manifest : null,
      }),
    );
  if (path.endsWith(`/uploads/${first}`))
    return Promise.resolve(
      json(
        session({
          purpose: 'replace',
          documentId: second,
          revision: 9,
          status: 'consumed',
          manifest,
        }),
      ),
    );
  throw new Error(`Unexpected asset request: ${path}`);
}
function Document({ readOnly = false }: { readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <AssetDocumentControls
      collection="images"
      documentId={second}
      versionId={first}
      revision={9}
      budget={budget}
      manifest={manifest}
      readOnly={readOnly}
      busy={busy}
      begin={() => {
        setBusy(true);
        const controller = new AbortController();
        return {
          revision: 9,
          signal: controller.signal,
          consumeUpload: () => Promise.resolve(ok({})),
          refresh,
          finish: (outcome) => {
            finish(outcome);
            if (outcome === 'confirmed') {
              controller.abort();
              setBusy(false);
            }
          },
        };
      }}
    />
  );
}
function subject(readOnly = false) {
  return (
    <Harness>
      <Document readOnly={readOnly} />
    </Harness>
  );
}
async function run(view: ReturnType<typeof render>) {
  fireEvent.click(screen.getByRole('button', { name: 'Reprocess image' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Run image processing' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Run image processing' }));
  const endpoint = unknown ? '/file-processings' : `/jobs/${second}`;
  await waitFor(() =>
    expect(fetcher.mock.calls.some(([input]) => requestUrl(input).endsWith(endpoint))).toBe(true),
  );
  if (unknown)
    await screen.findByText(
      'The operation result is not confirmed. It may have completed. Check it before repeating the action.',
    );
  return view;
}
beforeEach(() => {
  resetUi();
  unknown = true;
  done = false;
  fetcher.mockReset().mockImplementation(api);
  finish.mockReset();
  refresh.mockReset().mockResolvedValue(ok({}));
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('URL', BlobURL);
});
afterEach(() => vi.stubGlobal('URL', OriginalURL));

it.each(['assets.reprocess', 'assets.cancelUpload', 'assets.readUpload', 'content.getJob'])(
  'disables unknown-receipt actions after %s is revoked and never sends another processing POST',
  async (operation) => {
    const view = await run(render(subject()));
    ui.denied.add(operation);
    view.rerender(subject());
    expect(screen.getByRole('button', { name: 'Continue checking' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Continue checking' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(
      fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/file-processings')),
    ).toHaveLength(1);
    expect(finish).toHaveBeenCalledExactlyOnceWith('blocked');
  },
);
it('blocks writes while readonly or permission discovery is not ready, then recovers the original intent when allowed', async () => {
  const view = await run(render(subject()));
  view.rerender(subject(true));
  expect(screen.getByRole('button', { name: 'Continue checking' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeDisabled();
  ui.phase = 'loading';
  view.rerender(subject());
  expect(screen.getByRole('button', { name: 'Continue checking' })).toBeDisabled();
  ui.phase = 'failed';
  view.rerender(subject());
  expect(screen.getByRole('button', { name: 'Continue checking' })).toBeDisabled();
  ui.phase = 'ready';
  view.rerender(subject());
  unknown = false;
  expect(screen.getByRole('button', { name: 'Continue checking' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue checking' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/file-processings')),
    ).toHaveLength(2),
  );
  const posts = fetcher.mock.calls.filter(([input]) =>
    requestUrl(input).endsWith('/file-processings'),
  );
  expect(new Headers(posts[0]?.[1]?.headers).get('idempotency-key')).toBe(
    new Headers(posts[1]?.[1]?.headers).get('idempotency-key'),
  );
  expect(refresh).not.toHaveBeenCalled();
});
it('keeps accepted-job verification available while readonly and write permission is revoked', async () => {
  unknown = false;
  const view = await run(render(subject()));
  ui.denied.add('assets.reprocess');
  view.rerender(subject(true));
  expect(screen.getByRole('button', { name: 'Continue checking' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Cancel upload' })).toBeDisabled();
  done = true;
  fireEvent.click(screen.getByRole('button', { name: 'Continue checking' }));
  await waitFor(() => expect(finish).toHaveBeenCalledExactlyOnceWith('confirmed'));
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(
    fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/file-processings')),
  ).toHaveLength(1);
});
