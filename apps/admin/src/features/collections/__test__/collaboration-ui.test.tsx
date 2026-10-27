import {
  pageApi,
  resetPageApi,
  defaultPageRequest,
  descriptor,
  record,
  recordId,
  ok,
} from './page-fixture';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { renderManagement } from '../../../../../../test/support/admin-management';
import { DocumentEditorPage } from '../editor-page';
import { failure } from '../../../api/result';

const preview = {
  url: 'https://preview.example.test/document',
  origin: 'https://preview.example.test',
  live: true,
  devices: [
    { name: 'Desktop', width: 1280, height: 720 },
    { name: 'Mobile', width: 390, height: 844 },
  ],
};
const owner = {
  actorId: recordId,
  displayName: 'Morgan',
  generation: 3,
  expiresAt: new Date(Date.now() + 300000).toISOString(),
};
beforeEach(resetPageApi);
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function configure(
  input: {
    locks?: boolean;
    occupied?: boolean;
    preview?: typeof preview;
    initialFailure?: boolean;
  } = {},
) {
  pageApi.request.mockImplementation((request) => {
    if (request.operation === 'collections.editor')
      return Promise.resolve(
        ok(
          descriptor(record(), {
            preview: input.preview !== undefined,
            collaboration: input.locks ? { durationMs: 300000, heartbeatMs: 30000 } : null,
          }),
        ),
      );
    if (request.operation === 'documents.acquireLock')
      return Promise.resolve(
        input.initialFailure
          ? failure('forbidden', 403)
          : ok({
              enabled: true,
              owned: !input.occupied,
              durationMs: 300000,
              heartbeatMs: 30000,
              lease: owner,
            }),
      );
    if (request.operation === 'documents.releaseLock')
      return Promise.resolve(
        ok({ enabled: true, owned: false, durationMs: 300000, heartbeatMs: 30000, lease: null }),
      );
    if (request.operation === 'documents.unlock')
      return Promise.resolve(
        ok({
          enabled: true,
          owned: true,
          durationMs: 300000,
          heartbeatMs: 30000,
          lease: { ...owner, generation: 4 },
        }),
      );
    if (request.operation === 'documents.preview') return Promise.resolve(ok(input.preview));
    return defaultPageRequest(request);
  });
}
async function openPreview() {
  await userEvent.click(await screen.findByRole('button', { name: 'Preview' }));
  const frame = await screen.findByTitle('Live preview');
  if (!(frame instanceof HTMLIFrameElement) || !frame.contentWindow)
    throw new Error('Expected a preview frame');
  const post = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});
  fireEvent.load(frame);
  const { channel } = z.object({ channel: z.string() }).parse(post.mock.calls[0]?.[0]);
  return { frame, post, channel };
}

it('keeps occupied editors read only, allows explicit takeover and releases the exact tab on close', async () => {
  configure({ locks: true, occupied: true });
  const view = renderManagement(
    <DocumentEditorPage collectionKey="articles" documentId={recordId} />,
  );
  const title = await screen.findByRole('textbox', { name: /^Title/ });
  await screen.findByText(/Morgan/);
  expect(title).toHaveAttribute('readonly');
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Take over editing' }));
  await screen.findByText('Editing access reserved for this tab');
  expect(title).not.toHaveAttribute('readonly');
  view.unmount();
  const release = pageApi.request.mock.calls.findLast(
    ([request]) => request.operation === 'documents.releaseLock',
  )?.[0];
  expect(release).toMatchObject({
    operation: 'documents.releaseLock',
    query: { generation: 4 },
    keepalive: true,
  });
});

it('shows failed lease checks and retries through the public editing UI', async () => {
  configure({ locks: true, initialFailure: true });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByText('Editing access needs to be checked before saving.');
  configure({ locks: true });
  await userEvent.click(screen.getByRole('button', { name: 'Check editing access' }));
  expect(await screen.findByText('Editing access reserved for this tab')).toBeInTheDocument();
});

it('uses trusted origin, source and channel handshakes before sending authorized draft changes', async () => {
  configure({ preview });
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  const { frame, post, channel } = await openPreview();
  vi.useFakeTimers();
  const ready = { type: 'cms-preview-ready', channel };
  fireEvent(
    window,
    new MessageEvent('message', {
      origin: 'https://evil.example.test',
      source: frame.contentWindow,
      data: ready,
    }),
  );
  fireEvent(
    window,
    new MessageEvent('message', { origin: preview.origin, source: window, data: ready }),
  );
  fireEvent(
    window,
    new MessageEvent('message', {
      origin: preview.origin,
      source: frame.contentWindow,
      data: { ...ready, channel: 'wrong' },
    }),
  );
  expect(screen.getByText('Waiting for the preview page to connect…')).toBeInTheDocument();
  fireEvent(
    window,
    new MessageEvent('message', {
      origin: preview.origin,
      source: frame.contentWindow,
      data: ready,
    }),
  );
  expect(screen.getByText('Draft changes are shown in the preview.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Preview device'), { target: { value: '1' } });
  expect(frame).toHaveStyle({ width: '390px', height: '844px' });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(
    z
      .object({ type: z.string(), data: z.record(z.string(), z.unknown()) })
      .parse(post.mock.calls.at(-1)?.[0]),
  ).toMatchObject({ type: 'cms-preview-update', data: { title: 'Story' } });
  expect(post.mock.calls.at(-1)?.[1]).toBe(preview.origin);
  fireEvent.change(screen.getByRole('textbox', { name: /^Title/ }), {
    target: { value: 'Unsaved preview title' },
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(
    z
      .object({ type: z.string(), data: z.record(z.string(), z.unknown()) })
      .parse(post.mock.calls.at(-1)?.[0]),
  ).toMatchObject({ type: 'cms-preview-update', data: { title: 'Unsaved preview title' } });
  expect(post.mock.calls.at(-1)?.[1]).toBe(preview.origin);
  vi.useRealTimers();
  await userEvent.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('complementary', { name: 'Preview' })).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Preview' })).toHaveFocus();
});

it('stops live delivery when reauthorization fails and cancels updates when closed', async () => {
  configure({ preview });
  const view = renderManagement(
    <DocumentEditorPage collectionKey="articles" documentId={recordId} />,
  );
  const { frame, post, channel } = await openPreview();
  vi.useFakeTimers();
  fireEvent(
    window,
    new MessageEvent('message', {
      origin: preview.origin,
      source: frame.contentWindow,
      data: { type: 'cms-preview-ready', channel },
    }),
  );
  expect(screen.getByText('Draft changes are shown in the preview.')).toBeInTheDocument();
  configure({ preview });
  const request = pageApi.request.getMockImplementation();
  pageApi.request.mockImplementation((input) =>
    input.operation === 'documents.preview'
      ? Promise.resolve(failure('forbidden', 403))
      : request
        ? request(input)
        : defaultPageRequest(input),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(post).toHaveBeenCalledTimes(1);
  expect(pageApi.report).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  view.unmount();
  const calls = pageApi.request.mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300000);
  });
  expect(pageApi.request).toHaveBeenCalledTimes(calls);
});

it('keeps same-origin pages out of the embedded sandbox and hides unavailable previews', async () => {
  configure({
    preview: {
      ...preview,
      origin: window.location.origin,
      url: `${window.location.origin}/preview`,
      live: false,
    },
  });
  const view = renderManagement(
    <DocumentEditorPage collectionKey="articles" documentId={recordId} />,
  );
  await userEvent.click(await screen.findByRole('button', { name: 'Preview' }));
  await screen.findByText(
    'Embedded preview requires a trusted origin separate from this admin application.',
  );
  expect(screen.queryByTitle('Preview')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open preview in a new tab' })).toHaveAttribute(
    'href',
    `${window.location.origin}/preview`,
  );
  view.unmount();
  resetPageApi();
  renderManagement(<DocumentEditorPage collectionKey="articles" documentId={recordId} />);
  await screen.findByRole('textbox', { name: /^Title/ });
  expect(screen.queryByRole('button', { name: 'Preview' })).not.toBeInTheDocument();
});
