import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import { createAccessController } from '../controller';
import type { AccessData } from '../load-access';

const mock = vi.hoisted(() => ({
  load: vi.fn<(signal: AbortSignal) => Promise<ApiResult<AccessData>>>(),
}));
vi.mock('../load-access', () => ({ loadAccess: mock.load }));
function ready(): ApiResult<AccessData> {
  return {
    ok: true,
    status: 200,
    requestId: '',
    data: {
      operations: [
        { operationId: 'admins.list', scopeKind: 'global', collectionKey: null },
        { operationId: 'documents.update', scopeKind: 'collection', collectionKey: 'articles' },
      ],
      navigation: [
        { id: 'group', type: 'group', name: 'Real menu', path: null, icon: null, children: [] },
      ],
    },
  };
}
afterEach(() => vi.resetAllMocks());

it('authorizes only exact operation/scope triples after a complete ready snapshot', async () => {
  const controller = createAccessController(vi.fn<() => void>());
  expect(controller.can('admins.list')).toBe(false);
  mock.load.mockResolvedValue(ready());
  await controller.refresh();
  expect(controller.can('admins.list')).toBe(true);
  expect(controller.can('admins.create')).toBe(false);
  expect(controller.can('admins.list', { scopeKind: 'global', collectionKey: 'articles' })).toBe(
    false,
  );
  expect(controller.can('documents.update')).toBe(false);
  expect(
    controller.can('documents.update', { scopeKind: 'collection', collectionKey: 'articles' }),
  ).toBe(true);
  expect(
    controller.can('documents.update', { scopeKind: 'collection', collectionKey: 'pages' }),
  ).toBe(false);
  expect(controller.can('documents.update', { scopeKind: 'collection', collectionKey: null })).toBe(
    false,
  );
});

it('withdraws both old permissions and menus while refreshing and after a failed refresh', async () => {
  const controller = createAccessController(vi.fn<() => void>());
  mock.load
    .mockResolvedValueOnce(ready())
    .mockResolvedValueOnce(failure('backend_unavailable', 503));
  await controller.refresh();
  const refresh = controller.refresh();
  expect(controller.store.getState()).toMatchObject({
    phase: 'loading',
    operations: [],
    navigation: [],
  });
  expect(controller.can('admins.list')).toBe(false);
  await refresh;
  expect(controller.store.getState()).toMatchObject({
    phase: 'failed',
    operations: [],
    navigation: [],
  });
});

it('ignores a late earlier generation even when its transport does not respect abort', async () => {
  let old: ((result: ApiResult<AccessData>) => void) | undefined;
  mock.load
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          old = resolve;
        }),
    )
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      requestId: '',
      data: { operations: [], navigation: [] },
    });
  const controller = createAccessController(vi.fn<() => void>());
  const first = controller.refresh();
  await controller.refresh();
  old?.(ready());
  await first;
  expect(controller.store.getState()).toMatchObject({
    phase: 'ready',
    operations: [],
    navigation: [],
  });
  expect(controller.can('admins.list')).toBe(false);
});

it('stops requests after dispose but supports the deliberate StrictMode lifecycle restart', async () => {
  const controller = createAccessController(vi.fn<() => void>());
  mock.load.mockResolvedValue(ready());
  controller.dispose();
  await controller.refresh();
  expect(mock.load).not.toHaveBeenCalled();
  await controller.start();
  expect(controller.can('admins.list')).toBe(true);
});

it('does not publish a resolved snapshot or navigate after disposal', async () => {
  let resolve: ((result: ApiResult<AccessData>) => void) | undefined;
  let signal: AbortSignal | undefined;
  mock.load.mockImplementation((value) => {
    signal = value;
    return new Promise((done) => {
      resolve = done;
    });
  });
  const redirect = vi.fn<() => void>();
  const controller = createAccessController(redirect);
  const pending = controller.refresh();
  controller.dispose();
  resolve?.(failure('unauthenticated', 401));
  await pending;
  expect(signal?.aborted).toBe(true);
  expect(controller.store.getState().phase).toBe('loading');
  controller.reportResult(failure('unauthenticated', 401));
  expect(redirect).not.toHaveBeenCalled();
});

it('redirects a genuine expired session once but preserves credential and ordinary service errors', async () => {
  const redirect = vi.fn<() => void>();
  const controller = createAccessController(redirect);
  controller.reportResult(failure('invalid_credentials', 401));
  controller.reportResult(failure('backend_unavailable', 503));
  expect(redirect).not.toHaveBeenCalled();
  mock.load.mockResolvedValue(failure('unauthenticated', 401));
  await controller.refresh();
  controller.reportResult(failure('unauthenticated', 401));
  expect(redirect).toHaveBeenCalledOnce();
});

it('coalesces forbidden-result refreshes and does not loop when the access load itself is forbidden', async () => {
  const controller = createAccessController(vi.fn<() => void>());
  mock.load.mockResolvedValueOnce(ready()).mockResolvedValueOnce(failure('forbidden', 403));
  await controller.refresh();
  controller.reportResult(failure('forbidden', 403));
  controller.reportResult(failure('protected_resource', 403));
  await vi.waitFor(() => expect(controller.store.getState().phase).toBe('failed'));
  expect(mock.load).toHaveBeenCalledTimes(2);
  expect(controller.store.getState().phase).toBe('failed');
  controller.reportResult(ready());
  expect(mock.load).toHaveBeenCalledTimes(2);
});

it('turns an unexpected loader rejection into a safe failed state', async () => {
  mock.load.mockRejectedValue(new Error('Internal connection details'));
  const controller = createAccessController(vi.fn<() => void>());
  await controller.refresh();
  expect(controller.store.getState().error).toMatchObject({ error: { code: 'invalid_response' } });
  expect(controller.store.getState().error?.error.message).not.toContain('Internal');
});

it('regression: a disposed provider capability handle cannot authorize another action', async () => {
  mock.load.mockResolvedValue(ready());
  const controller = createAccessController(vi.fn<() => void>());
  await controller.refresh();
  controller.dispose();
  expect(controller.can('admins.list')).toBe(false);
});

it('regression: confirmed unauthentication withdraws permission before full navigation completes', async () => {
  mock.load.mockResolvedValue(ready());
  const controller = createAccessController(vi.fn<() => void>());
  await controller.refresh();
  controller.reportResult(failure('unauthenticated', 401));
  expect(controller.can('admins.list')).toBe(false);
  expect(controller.store.getState()).toMatchObject({
    phase: 'failed',
    operations: [],
    navigation: [],
  });
});

it('regression: a refresh already in flight cannot restore permissions after confirmed session expiry', async () => {
  let resolve: ((result: ApiResult<AccessData>) => void) | undefined;
  mock.load.mockResolvedValueOnce(ready()).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const controller = createAccessController(vi.fn<() => void>());
  await controller.refresh();
  const pending = controller.refresh();
  controller.reportResult(failure('unauthenticated', 401));
  resolve?.(ready());
  await pending;
  expect(controller.can('admins.list')).toBe(false);
  expect(controller.store.getState().phase).toBe('failed');
  await controller.refresh();
  expect(mock.load).toHaveBeenCalledTimes(2);
});
