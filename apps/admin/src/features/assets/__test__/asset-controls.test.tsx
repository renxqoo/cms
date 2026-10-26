import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AssetDocumentControls } from '../asset-document-controls';
import { AssetUploadQueue } from '../asset-upload-queue';
import { uploadServices } from '../upload-requests';
import type { AssetWriteLease, AssetWriteKind } from '../document-asset-types';
import { UnsavedChangesGuard } from '../../../components/cms/unsaved-changes';
import { Harness, json, requestUrl, resetUi, ui } from '../../../../test/support/admin-asset-ui';
import {
  budget,
  deferred,
  file,
  first,
  manifest,
  ok,
  second,
  session,
} from '../../../../test/support/admin-asset-data';
import type { ApiResult } from '../../../api/result';
import type { UploadSession } from '../../../contracts/assets';

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
const OriginalURL = URL;
const revoked = vi.fn<(url: string) => void>();
class BlobURL extends OriginalURL {
  static override createObjectURL = vi.fn<(value: Blob | MediaSource) => string>(
    () => 'blob:original',
  );
  static override revokeObjectURL = revoked;
}
const consume = vi.fn<AssetWriteLease['consumeUpload']>();
const refresh = vi.fn<AssetWriteLease['refresh']>();
const finish = vi.fn<AssetWriteLease['finish']>();
const began = vi.fn<(kind: AssetWriteKind) => void>();
let consumed = false;
let jobDone = false;
let failFirst = false;
let created = 0;
let cancelled = false;
let purpose: 'create' | 'replace' = 'replace';
function upload(id: string, status: UploadSession['status']) {
  return session({
    id,
    purpose,
    documentId: purpose === 'replace' ? second : null,
    revision: purpose === 'replace' ? 9 : null,
    status,
    manifest: status === 'ready' || status === 'consumed' ? manifest : null,
    failureCode: status === 'failed' ? 'unsupported_media_type' : null,
  });
}
function api(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
  const url = new OriginalURL(requestUrl(input), 'http://localhost');
  if (url.pathname.endsWith('/file'))
    return Promise.resolve(
      new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'image/png' } }),
    );
  if (url.pathname.endsWith('/file-processings'))
    return Promise.resolve(json({ jobId: second, uploadId: first }, 202));
  if (url.pathname.endsWith(`/jobs/${second}`))
    return Promise.resolve(
      json({
        id: second,
        collection: 'images',
        action: 'reprocess',
        status: jobDone ? 'succeeded' : 'running',
        attempts: 1,
        failureCode: null,
        uploadId: first,
        manifest: jobDone ? manifest : null,
      }),
    );
  if (url.pathname.endsWith('/uploads')) {
    created += 1;
    const body: unknown = JSON.parse(typeof init?.body === 'string' ? init.body : '{}');
    if (body && typeof body === 'object' && 'purpose' in body)
      purpose = body.purpose === 'replace' ? 'replace' : 'create';
    return Promise.resolve(json(upload(created === 1 ? first : second, 'pending'), 201));
  }
  const id = url.pathname.includes(second) ? second : first;
  if (init?.method === 'DELETE') {
    cancelled = true;
    return Promise.resolve(new Response(null, { status: 204 }));
  }
  if (url.pathname.endsWith('/completions'))
    return Promise.resolve(json(upload(id, 'processing'), 202));
  if (url.pathname.includes('/uploads/'))
    return Promise.resolve(
      json(
        upload(
          id,
          cancelled
            ? 'cancelled'
            : consumed || jobDone
              ? 'consumed'
              : failFirst && id === first
                ? 'failed'
                : 'ready',
        ),
      ),
    );
  throw new Error(`Unexpected asset request: ${url.pathname}`);
}
function DocumentHarness({ readOnly = false }: { readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  function begin(kind: AssetWriteKind): AssetWriteLease {
    began(kind);
    setBusy(true);
    const controller = new AbortController();
    return {
      revision: 9,
      signal: controller.signal,
      consumeUpload: consume,
      refresh,
      finish(outcome) {
        finish(outcome);
        if (outcome === 'confirmed') {
          setBusy(false);
          controller.abort();
        }
      },
    };
  }
  return (
    <AssetDocumentControls
      collection="images"
      documentId={second}
      versionId={first}
      revision={9}
      manifest={manifest}
      budget={budget}
      busy={busy}
      begin={begin}
      readOnly={readOnly}
    />
  );
}
beforeEach(() => {
  resetUi();
  consumed = false;
  jobDone = false;
  failFirst = false;
  created = 0;
  cancelled = false;
  purpose = 'replace';
  revoked.mockClear();
  fetcher.mockReset().mockImplementation(api);
  consume.mockReset().mockImplementation(() => {
    consumed = true;
    return Promise.resolve(ok({}));
  });
  refresh.mockReset().mockResolvedValue(ok({}));
  finish.mockReset();
  began.mockClear();
  vi.stubGlobal('fetch', fetcher);
  vi.stubGlobal('URL', BlobURL);
  vi.spyOn(uploadServices, 'write').mockImplementation((input) => {
    input.onProgress({ loaded: 2, total: 4 });
    return Promise.resolve(ok({ uploadId: input.session.id, bytes: 4, digest: 'digest' }));
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal('URL', OriginalURL);
});

it('replaces a file through the real queue and one lease without showing ready after confirmed consumption', async () => {
  render(
    <Harness>
      <StrictMode>
        <DocumentHarness />
      </StrictMode>
    </Harness>,
  );
  fireEvent.change(screen.getByLabelText('Replace file', { selector: 'input' }), {
    target: { files: [file()] },
  });
  expect((await screen.findAllByText('The file is attached to a document.'))[0]).toBeVisible();
  expect(
    screen.queryByText('The file is processed and ready. It has not been attached to a document.'),
  ).not.toBeInTheDocument();
  expect(began).toHaveBeenCalledExactlyOnceWith('replace');
  expect(consume).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  const create = fetcher.mock.calls.find(([input]) => requestUrl(input).endsWith('/uploads'));
  const body = create?.[1]?.body;
  expect(JSON.parse(typeof body === 'string' ? body : '')).toMatchObject({
    purpose: 'replace',
    documentId: second,
    revision: 9,
  });
});
it('does not expose replacement without documents.update and keeps readonly resources passive', () => {
  ui.denied.add('documents.update');
  const view = render(
    <Harness>
      <DocumentHarness />
    </Harness>,
  );
  expect(screen.queryByLabelText('Replace file', { selector: 'input' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reprocess image' })).toBeVisible();
  view.unmount();
  render(
    <Harness>
      <DocumentHarness readOnly />
    </Harness>,
  );
  expect(screen.queryByRole('button', { name: 'Reprocess image' })).not.toBeInTheDocument();
  expect(began).not.toHaveBeenCalled();
});
it('requires applied crop and valid variant fields, pins the original version and waits for terminal reprocessing', async () => {
  render(
    <Harness>
      <DocumentHarness />
    </Harness>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reprocess image' }));
  const dialog = screen.getByRole('dialog');
  await within(dialog).findByRole('group', { name: 'Private file preview' });
  const download = fetcher.mock.calls.find(([input]) => requestUrl(input).includes('/file?'));
  expect(
    new OriginalURL(requestUrl(download?.[0]), 'http://localhost').searchParams.get('versionId'),
  ).toBe(first);
  fireEvent.change(within(dialog).getByLabelText('Crop width'), { target: { value: '0.5' } });
  expect(within(dialog).getByRole('button', { name: 'Run image processing' })).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Crop X'), { target: { value: '0.25' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Apply crop and focal point' }));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add variant' }));
  expect(within(dialog).getByRole('button', { name: 'Run image processing' })).toBeDisabled();
  for (const [label, value] of [
    ['Variant name', 'thumb'],
    ['Width', '20'],
    ['Height', '10'],
    ['Quality', '85'],
  ] as const)
    fireEvent.change(within(dialog).getByLabelText(label), { target: { value } });
  fireEvent.change(within(dialog).getByLabelText('Fit'), { target: { value: 'cover' } });
  fireEvent.change(within(dialog).getByLabelText('Format'), { target: { value: 'webp' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Run image processing' }));
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([input]) => requestUrl(input).endsWith('/file-processings')),
    ).toBe(true),
  );
  expect(finish).not.toHaveBeenCalled();
  const post = fetcher.mock.calls.find(([input]) =>
    requestUrl(input).endsWith('/file-processings'),
  );
  const body = post?.[1]?.body;
  expect(JSON.parse(typeof body === 'string' ? body : '')).toEqual({
    revision: 9,
    recipe: {
      crop: { left: 10, top: 0, width: 20, height: 30 },
      focalPoint: { x: 0.5, y: 0.5 },
      variants: [
        { name: 'thumb', width: 20, height: 10, fit: 'cover', format: 'webp', quality: 85 },
      ],
    },
  });
  jobDone = true;
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue checking' }));
  await waitFor(() => expect(finish).toHaveBeenCalledExactlyOnceWith('confirmed'));
  expect(consume).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0] ?? document.body);
  await waitFor(() => expect(revoked).toHaveBeenCalledWith('blob:original'));
});
it('protects pointer-only recipe drafts through the single outer navigation guard', async () => {
  const subscription = vi.spyOn(ui.adapter, 'subscribe');
  render(
    <Harness>
      <UnsavedChangesGuard
        dirty={false}
        navigation={ui.adapter}
        labels={{
          title: 'Leave document?',
          description: 'Keep this draft?',
          confirm: 'Leave',
          cancel: 'Keep editing',
          close: 'Close',
        }}
      >
        <DocumentHarness />
      </UnsavedChangesGuard>
    </Harness>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reprocess image' }));
  const preview = await screen.findByRole('group', { name: 'Private file preview' });
  vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    toJSON: () => ({}),
  });
  fireEvent.pointerDown(preview, { clientX: 75, clientY: 25 });
  await act(async () => {
    ui.emitNavigation({ id: 'leave', href: '/dashboard', kind: 'push' });
    await Promise.resolve();
  });
  expect(await screen.findByRole('heading', { name: 'Leave document?' })).toBeVisible();
  expect(subscription).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(screen.getByLabelText('Focal X')).toHaveValue(0.75);
  expect(screen.getByLabelText('Focal Y')).toHaveValue(0.25);
});
it('retries failed create uploads with new sessions and reports actual cancellation instead of attaching them', async () => {
  purpose = 'create';
  failFirst = true;
  const ready = vi.fn<(value: UploadSession) => void>();
  const terminal = vi.fn<(value: UploadSession) => void>();
  const activity = vi.fn<(value: boolean) => void>();
  render(
    <Harness>
      <AssetUploadQueue
        collection="images"
        budget={budget}
        purpose="create"
        onReady={ready}
        onTerminal={terminal}
        onActivityChange={activity}
      />
    </Harness>,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [file()] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Retry with a new session' }));
  expect(
    await screen.findByText(
      'The file is processed and ready. It has not been attached to a document.',
    ),
  ).toBeVisible();
  expect(ready).toHaveBeenCalledWith(expect.objectContaining({ id: second, status: 'ready' }));
  expect(activity).toHaveBeenCalledWith(true);
  expect(activity).toHaveBeenLastCalledWith(false);
  const creates = fetcher.mock.calls.filter(([input]) => requestUrl(input).endsWith('/uploads'));
  expect(new Headers(creates[0]?.[1]?.headers).get('idempotency-key')).not.toBe(
    new Headers(creates[1]?.[1]?.headers).get('idempotency-key'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
  expect(await screen.findByText('Cancelled')).toBeVisible();
  expect(terminal).toHaveBeenCalledWith(
    expect.objectContaining({ id: second, status: 'cancelled' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  expect(screen.queryByText('image.png')).not.toBeInTheDocument();
});
it('keeps byte progress based on real loaded/total events and disables new uploads without all dependencies', async () => {
  const controls: { progress: ((value: { loaded: number; total: number | null }) => void) | null } =
    { progress: null };
  const pending = deferred<ApiResult<{ uploadId: string; bytes: number; digest: string }>>();
  vi.mocked(uploadServices.write).mockImplementation((input) => {
    controls.progress = input.onProgress;
    return pending.promise;
  });
  const view = render(
    <Harness>
      <AssetUploadQueue collection="images" budget={budget} purpose="create" />
    </Harness>,
  );
  fireEvent.change(screen.getByLabelText('Choose files'), { target: { files: [file()] } });
  await waitFor(() => expect(controls.progress).not.toBeNull());
  act(() => controls.progress?.({ loaded: 2, total: 4 }));
  expect(screen.getByRole('progressbar', { name: 'Sent' })).toHaveAttribute('aria-valuenow', '2');
  expect(screen.getByRole('progressbar', { name: 'Sent' })).toHaveAttribute('aria-valuemax', '4');
  act(() => controls.progress?.({ loaded: 3, total: null }));
  expect(screen.getByRole('progressbar', { name: 'Sent' })).not.toHaveAttribute('aria-valuenow');
  view.unmount();
  ui.denied.add('documents.create');
  render(
    <Harness>
      <AssetUploadQueue collection="images" budget={budget} purpose="create" />
    </Harness>,
  );
  expect(screen.getByLabelText('Choose files')).toBeDisabled();
});
