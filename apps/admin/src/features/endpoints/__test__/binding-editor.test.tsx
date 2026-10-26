import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  managementEndpoint,
  managementPermission,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { useBindingEditor } from '../use-binding-editor';

interface Input {
  operation: string;
  body?: unknown;
  params?: Record<string, string>;
  query?: Record<string, unknown>;
  signal: AbortSignal;
  idempotencyKey?: string;
}
const api = vi.hoisted(() => ({
  request: vi.fn<(input: Input) => Promise<ApiResult<unknown>>>(),
  refresh: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  denied: new Set<string>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    can: (id: string) => !api.denied.has(id),
    refresh: api.refresh,
    reportResult: api.report,
  }),
}));
const permission = managementPermission({
  id: '88888888-8888-4888-8888-888888888888',
  name: 'New permission',
});
beforeEach(() => api.denied.clear());
afterEach(() => vi.resetAllMocks());

it('updates an existing binding with its exact id and response-independent server version', async () => {
  const done = vi.fn<() => void>();
  api.request.mockResolvedValue(
    managementSuccess({
      ...managementEndpoint().binding,
      version: 11,
      permissionId: permission.id,
    }),
  );
  const { result } = renderHook(() => useBindingEditor(managementEndpoint(), done));
  act(() => result.current.select(permission.id));
  await act(async () => {
    await result.current.save([permission]);
  });
  expect(api.request.mock.calls[0]?.[0]).toMatchObject({
    operation: 'endpoints.updateBinding',
    params: { id: '33333333-3333-4333-8333-333333333333' },
    body: { version: 4, permissionId: permission.id },
  });
  expect(done).toHaveBeenCalledOnce();
  expect(api.refresh).toHaveBeenCalledOnce();
});

it('keeps an unknown creation body and idempotency key immutable until its result is known', async () => {
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(failure('invalid_input', 400))
    .mockResolvedValueOnce(managementSuccess(managementEndpoint().binding));
  const { result } = renderHook(() =>
    useBindingEditor(managementEndpoint({ binding: null }), vi.fn<() => void>()),
  );
  act(() => result.current.select(permission.id));
  await act(async () => {
    await result.current.save([permission]);
  });
  act(() => result.current.select(managementPermission().id));
  expect(result.current.selected).toBe(permission.id);
  await act(async () => {
    await result.current.save([permission]);
  });
  expect(api.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    api.request.mock.calls[0]?.[0].idempotencyKey,
  );
  expect(api.request.mock.calls[1]?.[0].body).toEqual({
    operationId: 'roles.list',
    scopeKind: 'global',
    collectionKey: null,
    permissionId: permission.id,
  });
  act(() => result.current.select(managementPermission().id));
  await act(async () => {
    await result.current.save([managementPermission()]);
  });
  expect(api.request.mock.calls[2]?.[0].idempotencyKey).not.toBe(
    api.request.mock.calls[1]?.[0].idempotencyKey,
  );
});

it('reads every unfiltered catalog page after conflict and preserves selection until explicit adoption', async () => {
  const others = Array.from({ length: 100 }, (_, index) =>
    managementEndpoint({ operationId: `other.${index}` }),
  );
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(managementSuccess({ rows: others, page: 1, pageSize: 100, total: 101 }))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [
          managementEndpoint({
            binding: {
              id: '33333333-3333-4333-8333-333333333333',
              permissionId: managementPermission().id,
              version: 12,
            },
          }),
        ],
        page: 2,
        pageSize: 100,
        total: 101,
      }),
    )
    .mockResolvedValueOnce(
      managementSuccess({
        ...managementEndpoint().binding,
        version: 13,
        permissionId: permission.id,
      }),
    );
  const { result } = renderHook(() => useBindingEditor(managementEndpoint(), vi.fn<() => void>()));
  act(() => result.current.select(permission.id));
  await act(async () => {
    await result.current.save([permission]);
    await result.current.save([permission]);
    await result.current.readCurrent();
  });
  expect(result.current.current.binding?.version).toBe(4);
  expect(result.current.latest?.binding?.version).toBe(12);
  act(() => result.current.adoptCurrent());
  expect(result.current.selected).toBe(permission.id);
  await act(async () => {
    await result.current.save([permission]);
  });
  expect(api.request.mock.calls[3]?.[0].body).toEqual({ version: 12, permissionId: permission.id });
  expect(api.request.mock.calls[1]?.[0].query).toEqual({ page: 1, pageSize: 100 });
});

it('rejects disabled, wrong-scope, read-only and unauthorized writes without inventing a binding', async () => {
  const { result } = renderHook(() => useBindingEditor(managementEndpoint(), vi.fn<() => void>()));
  act(() => result.current.select(permission.id));
  await act(async () => {
    await result.current.save([{ ...permission, status: 'disabled' }]);
  });
  expect(result.current.error?.error.code).toBe('invalid_input');
  await act(async () => {
    await result.current.save([
      { ...permission, scopeKind: 'collection', collectionKey: 'articles' },
    ]);
  });
  api.denied.add('endpoints.updateBinding');
  await act(async () => {
    await result.current.save([permission]);
  });
  const immutable = renderHook(() =>
    useBindingEditor(managementEndpoint({ bindingConfigurable: false }), vi.fn<() => void>()),
  );
  act(() => immutable.result.current.select(permission.id));
  api.denied.clear();
  await act(async () => {
    await immutable.result.current.save([permission]);
  });
  expect(api.request).not.toHaveBeenCalled();
});

it('blocks no-op and repeated submissions, retains read failures, and cancels unmounted mutations', async () => {
  const view = renderHook(() => useBindingEditor(managementEndpoint(), vi.fn<() => void>()));
  await act(async () => {
    await view.result.current.save([managementPermission()]);
  });
  expect(api.request).not.toHaveBeenCalled();
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(failure('forbidden', 403));
  act(() => view.result.current.select(permission.id));
  await act(async () => {
    await view.result.current.save([permission]);
    await view.result.current.readCurrent();
  });
  expect(view.result.current.error?.status).toBe(403);
  view.unmount();
  api.request.mockImplementation(() => new Promise(() => {}));
  const next = renderHook(() =>
    useBindingEditor(managementEndpoint({ binding: null }), vi.fn<() => void>()),
  );
  act(() => next.result.current.select(permission.id));
  act(() => {
    void next.result.current.save([permission]);
    void next.result.current.save([permission]);
  });
  expect(api.request.mock.calls).toHaveLength(3);
  const signal = api.request.mock.calls[2]?.[0].signal;
  next.unmount();
  expect(signal?.aborted).toBe(true);
});
