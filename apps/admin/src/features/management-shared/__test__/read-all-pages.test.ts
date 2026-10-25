import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { pageSchema } from '../../../contracts/access';
import { readAllPages } from '../read-all-pages';

const api = vi.hoisted(() => ({
  request:
    vi.fn<
      (input: {
        query?: Record<string, unknown>;
        signal: AbortSignal;
      }) => Promise<ApiResult<unknown>>
    >(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
const response = pageSchema(z.object({ id: z.string() }));
const key = (row: { id: string }) => row.id;
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, data, requestId: 'trace-id' };
}
function rows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) => ({ id: `resource-${offset + index}` }));
}
function input(signal = new AbortController().signal) {
  return { operation: 'roles.list' as const, response, signal, key };
}
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it('collects every unique row and preserves the final request ID', async () => {
  api.request
    .mockResolvedValueOnce(ok({ rows: rows(100), total: 150, page: 1, pageSize: 100 }))
    .mockResolvedValueOnce(ok({ rows: rows(50, 100), total: 150, page: 2, pageSize: 100 }));
  const result = await readAllPages(input());
  expect(result.ok ? result.data.length : null).toBe(150);
  expect(result.ok && result.data.at(-1)?.id).toBe('resource-149');
  expect(result.ok && result.requestId).toBe('trace-id');
  expect(api.request.mock.calls.map(([request]) => request.query?.page)).toEqual([1, 2]);
});

it('accepts a genuinely empty first page without publishing a fabricated item', async () => {
  api.request.mockResolvedValue(ok({ rows: [], total: 0, page: 1, pageSize: 100 }));
  expect(await readAllPages(input())).toMatchObject({ ok: true, data: [] });
  expect(api.request).toHaveBeenCalledOnce();
});

it.each([
  { rows: rows(1), total: 1, page: 2, pageSize: 100 },
  { rows: rows(1), total: 1, page: 1, pageSize: 10 },
  { rows: rows(0), total: 1, page: 1, pageSize: 100 },
  { rows: [{ id: '' }], total: 1, page: 1, pageSize: 100 },
  { rows: [{ id: 'same' }, { id: 'same' }], total: 2, page: 1, pageSize: 100 },
])('rejects inconsistent pagination after exactly two whole attempts: %j', async (page) => {
  api.request.mockResolvedValue(ok(page));
  expect(await readAllPages(input())).toMatchObject({
    ok: false,
    error: { code: 'inconsistent_pagination' },
  });
  expect(api.request).toHaveBeenCalledTimes(2);
});

it('restarts from page one when totals change and publishes only the coherent second attempt', async () => {
  api.request
    .mockResolvedValueOnce(ok({ rows: rows(100), total: 101, page: 1, pageSize: 100 }))
    .mockResolvedValueOnce(ok({ rows: rows(1, 100), total: 102, page: 2, pageSize: 100 }))
    .mockResolvedValueOnce(ok({ rows: [{ id: 'current' }], total: 1, page: 1, pageSize: 100 }));
  expect(await readAllPages(input())).toMatchObject({ ok: true, data: [{ id: 'current' }] });
  expect(api.request.mock.calls.map(([request]) => request.query?.page)).toEqual([1, 2, 1]);
});

it('does not publish duplicated items across two individually valid pages', async () => {
  api.request.mockImplementation(({ query }) =>
    Promise.resolve(
      ok({
        rows: query?.page === 1 ? rows(100) : [{ id: 'resource-0' }],
        total: 101,
        page: query?.page,
        pageSize: 100,
      }),
    ),
  );
  expect(await readAllPages(input())).toMatchObject({
    ok: false,
    error: { code: 'inconsistent_pagination' },
  });
  expect(api.request).toHaveBeenCalledTimes(4);
});

it('stops at the item budget before fetching an unbounded page set', async () => {
  api.request.mockResolvedValue(ok({ rows: rows(100), total: 10001, page: 1, pageSize: 100 }));
  expect(await readAllPages(input())).toMatchObject({
    ok: false,
    error: { code: 'read_limit_exceeded' },
  });
  expect(api.request).toHaveBeenCalledOnce();
});

it('preserves a real rate-limit failure without automatically retrying it', async () => {
  const limited = { ...failure('rate_limited', 429), retryAfterSeconds: 23 };
  api.request.mockResolvedValue(limited);
  expect(await readAllPages(input())).toEqual(limited);
  expect(api.request).toHaveBeenCalledOnce();
});

it('honors cancellation before the first request', async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await readAllPages(input(controller.signal))).toMatchObject({
    ok: false,
    error: { code: 'request_cancelled' },
  });
  expect(api.request).not.toHaveBeenCalled();
});

it('cancels the whole read at its single deadline rather than multiplying per-page timeouts', async () => {
  vi.useFakeTimers();
  api.request.mockImplementation(
    ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(failure('request_cancelled', 0)), {
          once: true,
        });
      }),
  );
  const result = readAllPages(input());
  await vi.advanceTimersByTimeAsync(30000);
  expect(await result).toMatchObject({ ok: false, error: { code: 'read_timeout' } });
  expect(vi.getTimerCount()).toBe(0);
});

it('cleans up its deadline and parent subscription after a manual abort', async () => {
  vi.useFakeTimers();
  const parent = new AbortController();
  const remove = vi.spyOn(parent.signal, 'removeEventListener');
  api.request.mockImplementation(
    ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(failure('request_cancelled', 0)), {
          once: true,
        });
      }),
  );
  const result = readAllPages(input(parent.signal));
  parent.abort();
  expect(await result).toMatchObject({ ok: false, error: { code: 'request_cancelled' } });
  expect(vi.getTimerCount()).toBe(0);
  expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
});

it('rejects caller pagination overrides and safely handles malformed key callbacks', async () => {
  expect(await readAllPages({ ...input(), query: { page: 20 } })).toMatchObject({
    ok: false,
    status: 400,
  });
  expect(api.request).not.toHaveBeenCalled();
  api.request.mockResolvedValue(ok({ rows: rows(1), total: 1, page: 1, pageSize: 100 }));
  expect(
    await readAllPages({
      ...input(),
      key: () => {
        throw new Error('Unexpected data');
      },
    }),
  ).toMatchObject({ ok: false, error: { code: 'invalid_response' } });
});

it('regression: a late successful page cannot turn a canceled read into successful options', async () => {
  let resolve: ((result: ApiResult<unknown>) => void) | undefined;
  api.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const controller = new AbortController();
  const pending = readAllPages(input(controller.signal));
  controller.abort();
  resolve?.(ok({ rows: [{ id: 'late' }], total: 1, page: 1, pageSize: 100 }));
  expect(await pending).toMatchObject({ ok: false, error: { code: 'request_cancelled' } });
});
