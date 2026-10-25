import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  managementNavigation,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import { useNavigationEditor } from '../use-navigation-editor';
import { flattenNavigation, navigationDraft } from '../navigation-model';

interface Input {
  operation: string;
  body?: unknown;
  params?: Record<string, string>;
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
const group = managementNavigation();
const nodes = flattenNavigation([group]);

it('creates only the real mutable create shape and reuses a key on unknown-result retries', async () => {
  const saved = vi.fn<() => void>();
  api.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(managementSuccess(group));
  const { result } = renderHook(() => useNavigationEditor(null, saved));
  const draft = { ...navigationDraft(null), name: 'New group' };
  await act(async () => {
    await result.current.save({ draft, nodes, permissions: [] });
  });
  act(() => result.current.setDraft({ ...draft, name: 'Buffered edit' }));
  expect(result.current.draft.name).toBe('New group');
  await act(async () => {
    await result.current.save({ draft, nodes, permissions: [] });
  });
  expect(api.request.mock.calls[0]?.[0].body).toEqual({
    parentId: null,
    type: 'group',
    name: 'New group',
    path: null,
    icon: null,
    sortOrder: 0,
    visibility: 'container',
    permissionId: null,
  });
  expect(api.request.mock.calls[0]?.[0].idempotencyKey).toBe(
    api.request.mock.calls[1]?.[0].idempotencyKey,
  );
  expect(saved).toHaveBeenCalledOnce();
  expect(api.refresh).toHaveBeenCalledOnce();
});

it('updates against the confirmed version and retains draft fields until explicit conflict review', async () => {
  api.request
    .mockResolvedValueOnce(failure('version_conflict', 409))
    .mockResolvedValueOnce(
      managementSuccess({ rows: [managementNavigation({ name: 'Server group', version: 8 })] }),
    )
    .mockResolvedValueOnce(
      managementSuccess(managementNavigation({ name: 'Draft group', version: 9 })),
    );
  const { result } = renderHook(() => useNavigationEditor(group, vi.fn<() => void>()));
  const draft = { ...navigationDraft(group), name: 'Draft group' };
  await act(async () => {
    await result.current.save({ draft, nodes, permissions: [] });
    await result.current.save({ draft, nodes, permissions: [] });
  });
  expect(api.request).toHaveBeenCalledOnce();
  await act(async () => {
    await result.current.readCurrent();
  });
  expect(result.current.current?.version).toBe(2);
  expect(result.current.latest?.version).toBe(8);
  act(() => result.current.adoptCurrent());
  expect(result.current.draft.name).toBe('Draft group');
  await act(async () => {
    await result.current.save({ draft: result.current.draft, nodes, permissions: [] });
  });
  expect(api.request.mock.calls[2]?.[0].body).toEqual({ version: 8, name: 'Draft group' });
});

it('rejects invalid parent shape, self-parent transitions, unchanged saves and missing read dependencies', async () => {
  const { result } = renderHook(() => useNavigationEditor(group, vi.fn<() => void>()));
  await act(async () => {
    await result.current.save({ draft: navigationDraft(group), nodes, permissions: [] });
  });
  await act(async () => {
    await result.current.save({
      draft: {
        ...navigationDraft(group),
        type: 'page',
        parentId: group.id,
        path: '/dashboard/roles',
        visibility: 'authenticated',
      },
      nodes,
      permissions: [],
    });
  });
  api.denied.add('navigation.list');
  await act(async () => {
    await result.current.save({
      draft: { ...navigationDraft(group), name: 'Changed' },
      nodes,
      permissions: [],
    });
    await result.current.readCurrent();
  });
  expect(api.request).not.toHaveBeenCalled();
});

it('keeps an unconfirmed node locked when its directory read fails and cancels unmounted writes', async () => {
  api.request
    .mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }))
    .mockResolvedValueOnce(failure('forbidden', 403));
  const { result, unmount } = renderHook(() => useNavigationEditor(group, vi.fn<() => void>()));
  await act(async () => {
    await result.current.save({
      draft: { ...navigationDraft(group), name: 'Draft' },
      nodes,
      permissions: [],
    });
    await result.current.readCurrent();
  });
  act(() => result.current.adoptCurrent());
  expect(result.current.phase).toBe('unconfirmed');
  expect(result.current.error?.status).toBe(403);
  unmount();
  api.request.mockImplementation(() => new Promise(() => {}));
  const pending = renderHook(() => useNavigationEditor(null, vi.fn<() => void>()));
  act(() => {
    void pending.result.current.save({
      draft: { ...navigationDraft(null), name: 'Group' },
      nodes,
      permissions: [],
    });
    void pending.result.current.save({
      draft: { ...navigationDraft(null), name: 'Group' },
      nodes,
      permissions: [],
    });
  });
  const signal = api.request.mock.calls.at(-1)?.[0].signal;
  pending.unmount();
  expect(signal?.aborted).toBe(true);
});
