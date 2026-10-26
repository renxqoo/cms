import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createPolling } from '../polling';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';

function visibility() {
  let state: DocumentVisibilityState = 'visible';
  const events = new EventTarget();
  return {
    get visibilityState() {
      return state;
    },
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    change(next: DocumentVisibilityState) {
      state = next;
      events.dispatchEvent(new Event('visibilitychange'));
    },
  };
}
function success(status: string): ApiResult<{ status: string }> {
  return { ok: true, status: 200, requestId: 'request', data: { status } };
}
function fixture() {
  const read = vi
    .fn<(signal: AbortSignal) => Promise<ApiResult<{ status: string }>>>()
    .mockResolvedValue(success('running'));
  const observed = vi.fn<(result: ApiResult<{ status: string }>) => void>();
  const page = visibility();
  const controller = createPolling({
    read,
    onResult: observed,
    terminal: (data) => data.status === 'done',
    intervalMs: 10000,
    budgetMs: 300000,
    visibility: page,
  });
  return { read, observed, page, controller };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('reads once then polls no faster than its interval and stops at terminal state', async () => {
  const { controller, read } = fixture();
  controller.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(9999);
  expect(read).toHaveBeenCalledTimes(1);
  read.mockResolvedValue(success('done'));
  await vi.advanceTimersByTimeAsync(1);
  expect(read).toHaveBeenCalledTimes(2);
  expect(controller.store.getState()).toMatchObject({
    terminal: true,
    phase: 'ready',
    data: { status: 'done' },
  });
  await vi.advanceTimersByTimeAsync(300000);
  expect(read).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it('aborts hidden and unmounted reads and ignores late results', async () => {
  const { controller, read, observed, page } = fixture();
  let resolve: ((value: ApiResult<{ status: string }>) => void) | null = null;
  read.mockImplementationOnce(
    () =>
      new Promise((complete) => {
        resolve = complete;
      }),
  );
  controller.start();
  const signal = read.mock.calls[0]?.[0];
  page.change('hidden');
  expect(signal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(20000);
  expect(read).toHaveBeenCalledTimes(1);
  if (resolve) (resolve as (value: ApiResult<{ status: string }>) => void)(success('done'));
  await vi.advanceTimersByTimeAsync(0);
  expect(observed).not.toHaveBeenCalled();
  page.change('visible');
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  controller.dispose();
  await vi.advanceTimersByTimeAsync(20000);
  expect(read).toHaveBeenCalledTimes(2);
});
it('preserves its original deadline across hidden periods and offers a fresh explicit waiting window', async () => {
  const { controller, read, page } = fixture();
  controller.start();
  await vi.advanceTimersByTimeAsync(0);
  page.change('hidden');
  await vi.advanceTimersByTimeAsync(300000);
  page.change('visible');
  expect(controller.store.getState().paused).toBe('deadline');
  expect(read).toHaveBeenCalledTimes(1);
  controller.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it('ends the whole automatic waiting budget even while a read is still in flight', async () => {
  const { controller, read } = fixture();
  read.mockImplementation(() => new Promise(() => {}));
  controller.start();
  await vi.advanceTimersByTimeAsync(300000);
  expect(controller.store.getState().paused).toBe('deadline');
  expect(read.mock.calls[0]?.[0].aborted).toBe(true);
  controller.dispose();
});
it('stops automatic retries for 429 and enforces the real Retry-After before manual resumption', async () => {
  const { controller, read } = fixture();
  read.mockResolvedValueOnce({ ...failure('rate_limited', 429), retryAfterSeconds: 30 });
  controller.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState().paused).toBe('limited');
  controller.resume();
  await vi.advanceTimersByTimeAsync(29999);
  expect(read).toHaveBeenCalledTimes(1);
  controller.resume();
  expect(read).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  controller.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it.each([
  { status: 429, paused: 'limited', retryAfterSeconds: 60 },
  { status: 503, paused: 'failure', retryAfterSeconds: null },
])(
  'regression: hidden tabs preserve manual $paused pauses after $status',
  async ({ status, paused, retryAfterSeconds }) => {
    const { controller, read, page } = fixture();
    read.mockResolvedValueOnce({ ...failure('request_failed', status), retryAfterSeconds });
    controller.start();
    await vi.advanceTimersByTimeAsync(0);
    page.change('hidden');
    await vi.advanceTimersByTimeAsync(1000);
    page.change('visible');
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(1);
    expect(controller.store.getState().paused).toBe(paused);
    await vi.advanceTimersByTimeAsync(60000);
    expect(read).toHaveBeenCalledTimes(1);
    controller.resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(read).toHaveBeenCalledTimes(2);
    controller.dispose();
  },
);
it('reports failures and thrown reads without automatic retries, and explicit reload cancels the previous read', async () => {
  const { controller, read } = fixture();
  read.mockRejectedValueOnce(new Error('Network failure'));
  controller.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(controller.store.getState()).toMatchObject({
    phase: 'failed',
    paused: 'failure',
    error: { error: { code: 'request_failed' } },
  });
  await vi.advanceTimersByTimeAsync(20000);
  expect(read).toHaveBeenCalledTimes(1);
  controller.resume();
  await vi.advanceTimersByTimeAsync(0);
  expect(read).toHaveBeenCalledTimes(2);
  controller.dispose();
  controller.resume();
  expect(read).toHaveBeenCalledTimes(2);
});
