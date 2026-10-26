import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { createProcessingController } from '../image-processing';
import { job, success, deferred, uploadId } from './support';

interface Request {
  operation: string;
  signal: AbortSignal;
  body?: unknown;
  idempotencyKey?: string;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(input: Request) => Promise<ApiResult<unknown>>>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
function processing() {
  const busy = vi.fn<(value: boolean) => void>();
  const changed = vi.fn<() => Promise<void>>().mockResolvedValue();
  const report = vi.fn<(...values: unknown[]) => void>();
  const controller = createProcessingController({
    collection: 'media',
    id: '22222222-2222-4222-8222-222222222222',
    onChanged: changed,
    onBusyChange: busy,
    reportResult: report,
  });
  return { controller, busy, changed, report };
}

it('keeps the document channel occupied from 202 through job completion and the confirmed document refresh', async () => {
  vi.useFakeTimers();
  const refreshed = deferred<void>();
  mocks.request
    .mockResolvedValueOnce(success({ jobId: job().id, uploadId }))
    .mockResolvedValueOnce(success(job()))
    .mockResolvedValueOnce(success(job({ status: 'succeeded' })));
  const { controller, busy, changed } = processing();
  changed.mockReturnValue(refreshed.promise);
  controller.start({ revision: 7, recipe: { variants: [] } });
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().phase).toBe('running');
  expect(busy).toHaveBeenLastCalledWith(true);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(changed).toHaveBeenCalledOnce();
  expect(busy).toHaveBeenCalledTimes(1);
  refreshed.resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(busy).toHaveBeenLastCalledWith(false);
  expect(controller.store.getState().phase).toBe('finished');
  expect(mocks.request.mock.calls[0]?.[0].body).toEqual({ revision: 7, recipe: { variants: [] } });
  controller.dispose();
});

it('uses the original intent to verify a lost reprocess acknowledgement and permits a new intent only after terminal failure', async () => {
  mocks.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(success({ jobId: job().id, uploadId }))
    .mockResolvedValueOnce(success(job({ status: 'failed', failureCode: 'processing_failed' })))
    .mockResolvedValueOnce(failure('forbidden', 403));
  const { controller, busy } = processing();
  controller.start({ revision: 7, recipe: { variants: [] } });
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('paused'));
  controller.start({ revision: 9, recipe: { variants: [] } });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  controller.resume();
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('finished'));
  expect(mocks.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    mocks.request.mock.calls[0]?.[0].idempotencyKey,
  );
  expect(busy).toHaveBeenLastCalledWith(false);
  controller.start({ revision: 9, recipe: { variants: [] } });
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('finished'));
  expect(mocks.request.mock.calls[3]?.[0].idempotencyKey).not.toBe(
    mocks.request.mock.calls[0]?.[0].idempotencyKey,
  );
  controller.dispose();
});

it('stops on a job-read rate limit and retains the accepted job for explicit verification', async () => {
  vi.useFakeTimers();
  mocks.request
    .mockResolvedValueOnce(success({ jobId: job().id, uploadId }))
    .mockResolvedValueOnce({ ...failure('rate_limited', 429), retryAfterSeconds: 25 })
    .mockResolvedValueOnce(success(job({ status: 'cancelled' })));
  const { controller } = processing();
  controller.start({ revision: 7, recipe: { variants: [] } });
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().phase).toBe('paused');
  expect(controller.store.getState().error?.retryAfterSeconds).toBe(25);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(mocks.request).toHaveBeenCalledTimes(2);
  controller.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().phase).toBe('finished');
  expect(mocks.request.mock.calls[2]?.[0].operation).toBe('content.getJob');
  controller.dispose();
});

it('aborts hidden and unmounted requests, ignores late results and does not resume hidden work automatically', async () => {
  const pending = deferred<ApiResult<unknown>>();
  mocks.request.mockReturnValue(pending.promise);
  const { controller, busy } = processing();
  controller.start({ revision: 7, recipe: { variants: [] } });
  controller.setVisible(false);
  expect(mocks.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  expect(controller.store.getState().phase).toBe('paused');
  pending.resolve(success({ jobId: job().id, uploadId }));
  await Promise.resolve();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  controller.resume();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  controller.setVisible(true);
  expect(mocks.request).toHaveBeenCalledTimes(1);
  controller.dispose();
  controller.resume();
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(busy).not.toHaveBeenCalledWith(false);
});

it('retains the write channel if refreshing a succeeded job fails, and releases it only after verification succeeds', async () => {
  mocks.request
    .mockResolvedValueOnce(success({ jobId: job().id, uploadId }))
    .mockResolvedValue(success(job({ status: 'succeeded' })));
  const { controller, changed, busy } = processing();
  changed.mockRejectedValueOnce(new Error('Refresh failed'));
  controller.start({ revision: 7, recipe: { variants: [] } });
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('paused'));
  expect(busy).not.toHaveBeenCalledWith(false);
  controller.resume();
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('finished'));
  expect(busy).toHaveBeenLastCalledWith(false);
  controller.dispose();
});

it('uses the five-minute automatic waiting budget and a fresh explicit waiting window', async () => {
  vi.useFakeTimers();
  mocks.request
    .mockResolvedValueOnce(success({ jobId: job().id, uploadId }))
    .mockResolvedValue(success(job({ status: 'running' })));
  const { controller } = processing();
  controller.start({ revision: 7, recipe: { variants: [] } });
  await vi.advanceTimersByTimeAsync(300_000);
  expect(controller.store.getState().phase).toBe('paused');
  const calls = mocks.request.mock.calls.length;
  controller.resume();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(mocks.request.mock.calls.length).toBeGreaterThan(calls);
  controller.dispose();
});
