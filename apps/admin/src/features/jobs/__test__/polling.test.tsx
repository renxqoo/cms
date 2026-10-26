import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { usePollingQuery } from '../use-polling-query';

interface Request {
  operation: string;
  signal: AbortSignal;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: Request) => Promise<ApiResult<{ status: string }>>>(),
  report: vi.fn<(result: unknown) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ reportResult: api.report }),
}));
const schema = z.object({ status: z.string() });
const active = (data: { status: string }) => data.status === 'running';
const success = (status: string): ApiResult<{ status: string }> => ({
  ok: true,
  status: 200,
  requestId: 'poll',
  data: { status },
});
function useTestQuery(intervalMs = 10_000, enabled = true) {
  return usePollingQuery({
    operation: 'content.getJob',
    params: { collection: 'articles', jobId: 'job' },
    response: schema,
    intervalMs,
    active,
    enabled,
  });
}
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  api.request.mockResolvedValue(success('running'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.resetAllMocks();
});

it('polls only after the list interval and stops permanently at a terminal state', async () => {
  const { result, unmount } = renderHook(() => useTestQuery());
  await settle();
  expect(api.request).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(9999));
  expect(api.request).toHaveBeenCalledTimes(1);
  api.request.mockResolvedValue(success('succeeded'));
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(api.request).toHaveBeenCalledTimes(2);
  expect(result.current.observing).toBe(false);
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.request).toHaveBeenCalledTimes(2);
  unmount();
});

it('aborts an in-flight read when hidden, ignores its late result and resumes with the original wait budget', async () => {
  let finish: ((value: ApiResult<{ status: string }>) => void) | undefined;
  api.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, unmount } = renderHook(() => useTestQuery());
  await settle();
  const signal = api.request.mock.calls[0]?.[0].signal;
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(signal?.aborted).toBe(true);
  act(() => {
    finish?.(success('succeeded'));
  });
  expect(result.current.data).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.request).toHaveBeenCalledTimes(1);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle();
  expect(api.request).toHaveBeenCalledTimes(2);
  unmount();
});

it('pauses after five minutes and continues only after an explicit user action', async () => {
  const { result, unmount } = renderHook(() => useTestQuery());
  await settle();
  await act(() => vi.advanceTimersByTimeAsync(300_000));
  expect(result.current.expired).toBe(true);
  const count = api.request.mock.calls.length;
  await act(() => vi.advanceTimersByTimeAsync(60_000));
  expect(api.request).toHaveBeenCalledTimes(count);
  act(() => result.current.resume());
  await settle();
  expect(api.request).toHaveBeenCalledTimes(count + 1);
  expect(result.current.expired).toBe(false);
  unmount();
});

it('stops on rate limits and respects Retry-After before an explicit resume', async () => {
  api.request.mockResolvedValueOnce({ ...failure('rate_limited', 429), retryAfterSeconds: 20 });
  const { result, unmount } = renderHook(() => useTestQuery());
  await settle();
  expect(result.current.error?.retryAfterSeconds).toBe(20);
  act(() => result.current.resume());
  await settle();
  expect(api.request).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(api.request).toHaveBeenCalledTimes(1);
  act(() => result.current.resume());
  await settle();
  expect(api.request).toHaveBeenCalledTimes(2);
  unmount();
});

it('does not fetch hidden or unauthorized resources and cleans pending requests on unmount', async () => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  const hidden = renderHook(() => useTestQuery());
  await settle();
  expect(api.request).not.toHaveBeenCalled();
  hidden.unmount();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  const denied = renderHook(() => useTestQuery(5000, false));
  await settle();
  expect(api.request).not.toHaveBeenCalled();
  denied.unmount();
  api.request.mockImplementation(() => new Promise(() => {}));
  const running = renderHook(() => useTestQuery(1));
  await settle();
  const signal = api.request.mock.calls[0]?.[0].signal;
  running.unmount();
  expect(signal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it('regression: returning to a hidden page after its wait deadline does not issue another automatic request', async () => {
  const { result, unmount } = renderHook(() => useTestQuery());
  await settle();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await act(() => vi.advanceTimersByTimeAsync(300_001));
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await settle();
  expect(api.request).toHaveBeenCalledTimes(1);
  expect(result.current.expired).toBe(true);
  unmount();
});
