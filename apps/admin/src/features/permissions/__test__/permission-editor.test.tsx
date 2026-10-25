import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  managementPermission,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { usePermissionEditor } from '../use-permission-editor';

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

beforeEach(() => api.denied.clear());
afterEach(() => vi.resetAllMocks());

it('updates only changed mutable permission fields using the server version', async () => {
  const done = vi.fn<() => void>();
  api.request.mockResolvedValue(
    managementSuccess(
      managementPermission({
        name: 'Updated',
        description: 'Details',
        status: 'disabled',
        version: 8,
      }),
    ),
  );
  const { result } = renderHook(() => usePermissionEditor(managementPermission(), done));
  await act(async () => {
    await result.current.save({
      ...result.current.draft,
      name: 'Updated',
      description: 'Details',
      status: 'disabled',
    });
  });
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    version: 3,
    name: 'Updated',
    description: 'Details',
    status: 'disabled',
  });
  expect(api.refresh).toHaveBeenCalledOnce();
  expect(done).toHaveBeenCalledOnce();
});

it('holds the creation intent and key during unknown-result retries and generates a fresh key after changed confirmed failure', async () => {
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(failure('invalid_input', 400))
    .mockResolvedValueOnce(managementSuccess(managementPermission()));
  const { result } = renderHook(() => usePermissionEditor(null, vi.fn<() => void>()));
  const draft = { ...result.current.draft, code: 'content:read', name: 'Read' };
  await act(async () => {
    await result.current.save(draft);
  });
  act(() => result.current.setDraft({ ...draft, name: 'Forbidden late edit' }));
  await act(async () => {
    await result.current.save({ ...draft, name: 'Should be ignored during retry' });
  });
  expect(api.request.mock.calls[1]?.[0].body).toEqual(api.request.mock.calls[0]?.[0].body);
  expect(api.request.mock.calls[1]?.[0].idempotencyKey).toBe(
    api.request.mock.calls[0]?.[0].idempotencyKey,
  );
  await act(async () => {
    await result.current.save({ ...draft, name: 'Changed intent' });
  });
  expect(api.request.mock.calls[2]?.[0].idempotencyKey).not.toBe(
    api.request.mock.calls[1]?.[0].idempotencyKey,
  );
});

it('preserves the draft and refuses another update until a full-catalog conflict read is reviewed', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({
        rows: [managementPermission({ name: 'Server version', version: 10 })],
        total: 1,
        page: 1,
        pageSize: 100,
      }),
    )
    .mockResolvedValueOnce(managementSuccess(managementPermission({ name: 'Draft', version: 11 })));
  const { result } = renderHook(() =>
    usePermissionEditor(managementPermission(), vi.fn<() => void>()),
  );
  const draft = { ...result.current.draft, name: 'Draft' };
  await act(async () => {
    await result.current.save(draft);
    await result.current.save(draft);
  });
  expect(api.request).toHaveBeenCalledOnce();
  await act(async () => {
    await result.current.readCurrent();
  });
  expect(result.current.current?.version).toBe(3);
  expect(result.current.latest?.version).toBe(10);
  act(() => result.current.adoptCurrent());
  expect(result.current.draft.name).toBe('Draft');
  await act(async () => {
    await result.current.save(result.current.draft);
  });
  expect(api.request.mock.calls[2]?.[0].body).toEqual({ version: 10, name: 'Draft' });
  expect(api.request.mock.calls[1]?.[0].query).not.toHaveProperty('q');
});

it('does not mistake absence from a complete catalog for a filtered current-page lookup', async () => {
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
  const { result } = renderHook(() =>
    usePermissionEditor(managementPermission(), vi.fn<() => void>()),
  );
  await act(async () => {
    await result.current.save({ ...result.current.draft, name: 'Draft' });
    await result.current.readCurrent();
  });
  expect(result.current.error?.error.code).toBe('not_found');
  expect(result.current.latest).toBeNull();
  expect(result.current.phase).toBe('unconfirmed');
});

it('blocks invalid and no-op inputs, missing write authorization, and failed conflict reads', async () => {
  const { result } = renderHook(() =>
    usePermissionEditor(managementPermission(), vi.fn<() => void>()),
  );
  await act(async () => {
    await result.current.save(result.current.draft);
  });
  expect(api.request).not.toHaveBeenCalled();
  api.denied.add('permissions.update');
  await act(async () => {
    await result.current.save({ ...result.current.draft, name: 'Draft' });
  });
  expect(api.request).not.toHaveBeenCalled();
  api.denied.clear();
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(failure('forbidden', 403));
  await act(async () => {
    await result.current.save({ ...result.current.draft, name: 'Draft' });
    await result.current.readCurrent();
  });
  expect(result.current.error?.status).toBe(403);
});

it('cancels an unmounted in-flight mutation and rejects same-turn repeated submissions', () => {
  api.request.mockImplementation(() => new Promise(() => {}));
  const view = renderHook(() => usePermissionEditor(null, vi.fn<() => void>()));
  const draft = { ...view.result.current.draft, code: 'content:read', name: 'Read' };
  act(() => {
    void view.result.current.save(draft);
    void view.result.current.save(draft);
  });
  expect(api.request).toHaveBeenCalledOnce();
  const signal = api.request.mock.calls[0]?.[0].signal;
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
