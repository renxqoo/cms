import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { useWorkAction } from '../use-work-action';

interface Request {
  signal: AbortSignal;
  idempotencyKey?: string;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: Request) => Promise<ApiResult<undefined>>>(),
  report: vi.fn<(result: unknown) => void>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({ reportResult: api.report }),
}));
const schema = z.undefined();
afterEach(() => vi.resetAllMocks());

it('blocks duplicate mutations and prevents a second write after confirmed success', async () => {
  api.request.mockResolvedValue({ ok: true, status: 204, data: undefined, requestId: 'cancel' });
  const { result } = renderHook(() =>
    useWorkAction({
      operation: 'assets.cancelUpload',
      params: { collection: 'media', uploadId: 'id' },
      response: schema,
      allowed: true,
    }),
  );
  await act(() => Promise.all([result.current.run(), result.current.run()]));
  expect(result.current.phase).toBe('done');
  await act(() => result.current.run());
  expect(api.request).toHaveBeenCalledTimes(1);
});

it('does not issue denied writes and permits explicit retry after a known failure', async () => {
  api.request.mockResolvedValue(failure('resource_in_use', 409));
  const { result, rerender } = renderHook(
    ({ allowed }) =>
      useWorkAction({
        operation: 'assets.cancelUpload',
        params: { collection: 'media', uploadId: 'id' },
        response: schema,
        allowed,
      }),
    { initialProps: { allowed: false } },
  );
  await act(() => result.current.run());
  expect(api.request).not.toHaveBeenCalled();
  rerender({ allowed: true });
  await act(() => result.current.run());
  expect(result.current.phase).toBe('idle');
  expect(result.current.error?.error.code).toBe('resource_in_use');
  await act(() => result.current.run());
  expect(api.request).toHaveBeenCalledTimes(2);
});

it('aborts a pending write on unmount and ignores its late completion', async () => {
  let finish: ((result: ApiResult<undefined>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, unmount } = renderHook(() =>
    useWorkAction({
      operation: 'assets.cancelUpload',
      params: { collection: 'media', uploadId: 'id' },
      response: schema,
      allowed: true,
    }),
  );
  let writing: Promise<void> | undefined;
  act(() => {
    writing = result.current.run();
  });
  const signal = api.request.mock.calls[0]?.[0].signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.({ ok: true, status: 204, data: undefined, requestId: 'late' });
    await writing;
  });
  expect(api.report).not.toHaveBeenCalled();
});
