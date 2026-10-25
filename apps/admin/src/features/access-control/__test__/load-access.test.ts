import { afterEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { loadAccess } from '../load-access';

const mock = vi.hoisted(() => ({
  request:
    vi.fn<(input: { operation: string; signal: AbortSignal }) => Promise<ApiResult<unknown>>>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mock.request }));
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, data, requestId: 'request-id' };
}
const operationPage = {
  rows: [{ operationId: 'admins.list', scopeKind: 'global', collectionKey: null }],
  total: 1,
  page: 1,
  pageSize: 100,
};
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});

it('publishes operations and navigation as one complete snapshot', async () => {
  mock.request.mockImplementation(({ operation }) =>
    Promise.resolve(
      ok(
        operation === 'access.myOperations'
          ? operationPage
          : {
              rows: [
                { id: 'group', type: 'group', name: 'Team', path: null, icon: null, children: [] },
              ],
            },
      ),
    ),
  );
  const result = await loadAccess(new AbortController().signal);
  expect(result).toMatchObject({
    ok: true,
    data: {
      operations: [{ operationId: 'admins.list', scopeKind: 'global', collectionKey: null }],
      navigation: [{ name: 'Team' }],
    },
  });
});

it('does not expose completed operations when navigation fails', async () => {
  mock.request.mockImplementation(({ operation }) =>
    Promise.resolve(
      operation === 'access.myOperations' ? ok(operationPage) : failure('backend_unavailable', 503),
    ),
  );
  const result = await loadAccess(new AbortController().signal);
  expect(result).toMatchObject({ ok: false, error: { code: 'backend_unavailable' } });
  expect(result).not.toHaveProperty('data');
});

it('rejects inconsistent global/collection authorization tuples without publishing partial permits', async () => {
  mock.request.mockImplementation(({ operation }) =>
    Promise.resolve(
      ok(
        operation === 'access.myOperations'
          ? {
              ...operationPage,
              rows: [
                { operationId: 'admins.list', scopeKind: 'global', collectionKey: 'articles' },
              ],
            }
          : { rows: [] },
      ),
    ),
  );
  expect(await loadAccess(new AbortController().signal)).toMatchObject({
    ok: false,
    error: { code: 'inconsistent_pagination' },
  });
  expect(mock.request).toHaveBeenCalledTimes(3);
});

it('stops before requesting a snapshot when the provider has already been canceled', async () => {
  const controller = new AbortController();
  controller.abort();
  expect(await loadAccess(controller.signal)).toMatchObject({
    ok: false,
    error: { code: 'request_cancelled' },
  });
  expect(mock.request).not.toHaveBeenCalled();
});

it('enforces one overall deadline over both menu and operation reads', async () => {
  vi.useFakeTimers();
  mock.request.mockImplementation(
    ({ signal }) =>
      new Promise((resolve) => {
        signal.addEventListener('abort', () => resolve(failure('request_cancelled', 0)), {
          once: true,
        });
      }),
  );
  const pending = loadAccess(new AbortController().signal);
  await vi.advanceTimersByTimeAsync(30000);
  expect(await pending).toMatchObject({ ok: false, error: { code: 'read_timeout' } });
  expect(vi.getTimerCount()).toBe(0);
});
