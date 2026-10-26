import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { createUploadController } from '../upload-controller';
import { session, success, deferred, uploadId, manifest } from './support';

interface Request {
  operation: string;
  signal: AbortSignal;
  params?: Readonly<Record<string, string>>;
  body?: unknown;
  idempotencyKey?: string;
  onUploadProgress?: (progress: { loaded: number; total: number | null }) => void;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(input: Request) => Promise<ApiResult<unknown>>>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
function queue(purpose: 'create' | 'replace' = 'create') {
  return createUploadController({
    collection: 'media',
    purpose,
    ...(purpose === 'replace'
      ? { documentId: '22222222-2222-4222-8222-222222222222', revision: 7 }
      : {}),
    onResult: vi.fn<(...values: unknown[]) => void>(),
  });
}
const file = () => new File(['contents'], 'source.png', { type: 'image/png' });

it('sends actual byte progress, waits for server processing and keeps ready separate from consumed', async () => {
  vi.useFakeTimers();
  mocks.request.mockImplementation((input) => {
    if (input.operation === 'assets.createUpload') return Promise.resolve(success(session()));
    if (input.operation === 'assets.writeUpload') {
      input.onUploadProgress?.({ loaded: 4, total: 8 });
      return Promise.resolve(success({ uploadId, bytes: 8, digest: 'digest' }));
    }
    if (input.operation === 'assets.completeUpload')
      return Promise.resolve(success(session({ status: 'processing' })));
    return Promise.resolve(success(session({ status: 'ready', manifest })));
  });
  const controller = queue();
  controller.enqueue([file()]);
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().items[0]?.status).toBe('processing');
  expect(controller.store.getState().items[0]?.progress).toBe(100);
  expect(
    mocks.request.mock.calls.find(([input]) => input.operation === 'assets.writeUpload')?.[0].body,
  ).toBeInstanceOf(File);
  await vi.advanceTimersByTimeAsync(9999);
  expect(
    mocks.request.mock.calls.filter(([input]) => input.operation === 'assets.readUpload'),
  ).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(1);
  expect(controller.store.getState().items[0]?.status).toBe('ready');
  controller.markConsumed(controller.store.getState().items[0]?.id ?? '');
  expect(controller.store.getState().items[0]?.status).toBe('consumed');
  controller.dispose();
});

it('limits active file workflows to two and starts the queued file after a terminal result', async () => {
  const first = deferred<ApiResult<unknown>>();
  mocks.request.mockImplementation(async () => first.promise);
  const controller = queue();
  controller.enqueue([file(), file(), file()]);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(controller.store.getState().items[2]?.status).toBe('queued');
  first.resolve(failure('unsupported_media_type', 415));
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(3));
  await vi.waitFor(() =>
    expect(controller.store.getState().items.every((item) => item.status === 'failed')).toBe(true),
  );
  controller.dispose();
});

it('keeps an uncertain create intent and never starts a second create identity during verification', async () => {
  mocks.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })));
  const controller = queue();
  controller.enqueue([file()]);
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('paused'));
  const id = controller.store.getState().items[0]?.id ?? '';
  controller.retry(id);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  controller.verify(id);
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('ready'));
  expect(mocks.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    mocks.request.mock.calls[0]?.[0].idempotencyKey,
  );
  controller.dispose();
});

it('does not resend failed bytes and uses a new upload session only after explicit retry', async () => {
  mocks.request
    .mockResolvedValueOnce(success(session()))
    .mockResolvedValueOnce(failure('unsupported_media_type', 415))
    .mockResolvedValue(success(session({ status: 'ready', manifest })));
  const controller = queue('replace');
  controller.enqueue([file()]);
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('failed'));
  const id = controller.store.getState().items[0]?.id ?? '';
  controller.retry(id);
  await vi.waitFor(() => expect(controller.store.getState().items[1]?.status).toBe('ready'));
  const creates = mocks.request.mock.calls.filter(
    ([input]) => input.operation === 'assets.createUpload',
  );
  expect(creates[0]?.[0].body).toMatchObject({
    purpose: 'replace',
    revision: 7,
    documentId: '22222222-2222-4222-8222-222222222222',
  });
  expect(creates[1]?.[0].idempotencyKey).not.toBe(creates[0]?.[0].idempotencyKey);
  expect(
    mocks.request.mock.calls.filter(([input]) => input.operation === 'assets.writeUpload'),
  ).toHaveLength(1);
  controller.dispose();
});

it('replays only an uncertain completion with the same key and does not repeat the byte transfer', async () => {
  mocks.request
    .mockResolvedValueOnce(success(session()))
    .mockResolvedValueOnce(success({ uploadId, bytes: 8, digest: 'digest' }))
    .mockResolvedValueOnce(failure('request_timeout', 503, { uncertain: true }))
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })));
  const controller = queue();
  controller.enqueue([file()]);
  await vi.waitFor(() =>
    expect(controller.store.getState().items[0]?.uncertainStep).toBe('complete'),
  );
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('paused'));
  controller.verify(controller.store.getState().items[0]?.id ?? '');
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('ready'));
  expect(mocks.request.mock.calls[3]?.[0].idempotencyKey).toBe(
    mocks.request.mock.calls[2]?.[0].idempotencyKey,
  );
  expect(
    mocks.request.mock.calls.filter(([input]) => input.operation === 'assets.writeUpload'),
  ).toHaveLength(1);
  controller.dispose();
});

it('stops polling while hidden, rejects late responses and requires explicit verification to continue', async () => {
  vi.useFakeTimers();
  mocks.request.mockResolvedValue(success(session({ status: 'processing' })));
  const controller = queue();
  controller.recover(session({ status: 'processing' }));
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('processing'));
  controller.setVisible(false);
  expect(mocks.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  controller.setVisible(true);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  mocks.request.mockResolvedValue(success(session({ status: 'ready', manifest })));
  controller.verify(uploadId);
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('ready'));
  controller.dispose();
});

it('cancels the actual remote session and preserves consumed conflicts rather than reporting cancellation', async () => {
  mocks.request.mockResolvedValueOnce(failure('resource_in_use', 409));
  const controller = queue();
  controller.recover(session({ status: 'ready', manifest }));
  await controller.cancel(uploadId);
  expect(controller.store.getState().items[0]?.status).toBe('paused');
  expect(controller.store.getState().items[0]?.error?.error.code).toBe('resource_in_use');
  mocks.request.mockResolvedValueOnce(success());
  await controller.cancel(uploadId);
  expect(controller.store.getState().items[0]?.status).toBe('cancelled');
  controller.dispose();
});

it('does not forget an in-flight creation when the user cancels before receiving its session id', async () => {
  const result = deferred<ApiResult<unknown>>();
  mocks.request.mockReturnValue(result.promise);
  const controller = queue();
  controller.enqueue([file()]);
  const id = controller.store.getState().items[0]?.id ?? '';
  await controller.cancel(id);
  expect(controller.store.getState().items[0]?.status).toBe('paused');
  result.resolve(success(session()));
  await Promise.resolve();
  expect(controller.store.getState().items[0]?.session).toBeNull();
  controller.dispose();
});

it('stops automatically after five minutes and never automatically retries a rate limit', async () => {
  vi.useFakeTimers();
  mocks.request.mockResolvedValue(success(session({ status: 'processing' })));
  const controller = queue();
  controller.recover(session({ status: 'processing' }));
  await vi.advanceTimersByTimeAsync(300_000);
  expect(controller.store.getState().items[0]?.status).toBe('paused');
  const calls = mocks.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.request).toHaveBeenCalledTimes(calls);
  mocks.request.mockResolvedValueOnce({ ...failure('rate_limited', 429), retryAfterSeconds: 60 });
  controller.verify(uploadId);
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().items[0]?.error?.retryAfterSeconds).toBe(60);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.request).toHaveBeenCalledTimes(calls + 1);
  controller.dispose();
});

it('regression: permits explicit verification of a rate-limited create using the same pending intent', async () => {
  vi.useFakeTimers();
  mocks.request
    .mockResolvedValueOnce({ ...failure('rate_limited', 429), retryAfterSeconds: 30 })
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })));
  const controller = queue();
  controller.enqueue([file()]);
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('paused'));
  await vi.advanceTimersByTimeAsync(30_000);
  controller.verify(controller.store.getState().items[0]?.id ?? '');
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('ready'));
  expect(mocks.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    mocks.request.mock.calls[0]?.[0].idempotencyKey,
  );
  controller.dispose();
});

it('regression: a failed session read pauses verification without claiming that the remote upload failed', async () => {
  mocks.request
    .mockResolvedValueOnce(failure('temporarily_unavailable', 503))
    .mockResolvedValueOnce(success(session({ status: 'ready', manifest })));
  const controller = queue();
  controller.recover(session({ status: 'processing' }));
  await vi.waitFor(() =>
    expect(controller.store.getState().items[0]?.error?.error.code).toBe('temporarily_unavailable'),
  );
  expect(controller.store.getState().items[0]?.status).toBe('paused');
  expect(controller.store.getState().items[0]?.session?.status).toBe('processing');
  controller.verify(uploadId);
  await vi.waitFor(() => expect(controller.store.getState().items[0]?.status).toBe('ready'));
  controller.dispose();
});

it('regression: a rate limit pauses the remaining upload queue until explicit verification after Retry-After', async () => {
  vi.useFakeTimers();
  const blocked = deferred<ApiResult<unknown>>();
  const concurrent = deferred<ApiResult<unknown>>();
  mocks.request
    .mockReturnValueOnce(blocked.promise)
    .mockReturnValueOnce(concurrent.promise)
    .mockResolvedValue(success(session({ status: 'ready', manifest })));
  const controller = queue();
  controller.enqueue([file(), file(), file()]);
  blocked.resolve({ ...failure('rate_limited', 429), retryAfterSeconds: 30 });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(controller.store.getState().items[2]?.status).toBe('queued');
  concurrent.resolve(success(session({ status: 'ready', manifest })));
  const id = controller.store.getState().items[0]?.id ?? '';
  controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().items[0]?.status).toBe('ready');
  expect(controller.store.getState().items[2]?.status).toBe('ready');
  controller.verify(controller.store.getState().items[1]?.id ?? '');
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().items.every((item) => item.status === 'ready')).toBe(true);
  controller.dispose();
});
