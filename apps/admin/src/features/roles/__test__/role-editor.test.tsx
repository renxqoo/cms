import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import type { RoleDetail } from '../../../contracts/access';
import { useRoleEditor } from '../use-role-editor';

interface Input {
  operation: string;
  body?: unknown;
  signal: AbortSignal;
}
const mocks = vi.hoisted(() => ({
  request: vi.fn<(input: Input) => Promise<ApiResult<unknown>>>(),
  refresh: vi.fn<() => void>(),
  report: vi.fn<(result: unknown) => void>(),
  can: vi.fn<(id: string) => boolean>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: mocks.request }));
vi.mock('../../access-control/provider', () => ({
  useAccessControl: () => ({
    principal: { roleId: 'other-role' },
    can: mocks.can,
    reportResult: mocks.report,
    refresh: mocks.refresh,
  }),
}));

const initial: RoleDetail = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 7,
  code: 'editor',
  name: 'Editor',
  description: null,
  status: 'active',
  isSuper: false,
  permissionIds: ['permission-one'],
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};
function success(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, data, requestId: '' };
}
beforeEach(() => {
  mocks.can.mockReturnValue(true);
});
afterEach(() => vi.resetAllMocks());

it('serializes the two save areas, uses returned versions and preserves the other dirty draft', async () => {
  mocks.request
    .mockResolvedValueOnce(success({ ...initial, version: 11, name: 'Reviewer' }))
    .mockResolvedValueOnce(
      success({ ...initial, version: 12, name: 'Reviewer', permissionIds: ['permission-two'] }),
    );
  const { result } = renderHook(() => useRoleEditor(initial));
  act(() => {
    result.current.setValues({ name: 'Reviewer', description: null, status: 'active' });
    result.current.setGrants(['permission-two']);
  });
  await act(async () => {
    await result.current.save('metadata');
  });
  expect(mocks.request.mock.calls[0]?.[0].body).toEqual({ version: 7, name: 'Reviewer' });
  expect(result.current.grants).toEqual(['permission-two']);
  expect(result.current.confirmed.permissionIds).toEqual(['permission-one']);
  await act(async () => {
    await result.current.save('grants');
  });
  expect(mocks.request.mock.calls[1]?.[0].body).toEqual({
    version: 11,
    permissionIds: ['permission-two'],
  });
  expect(result.current.confirmed.version).toBe(12);
  expect(result.current.values.name).toBe('Reviewer');
});

it('does not send no-op metadata or permission writes', async () => {
  const { result } = renderHook(() => useRoleEditor(initial));
  await act(async () => {
    await result.current.save('metadata');
    await result.current.save('grants');
  });
  expect(mocks.request).not.toHaveBeenCalled();
});

it('regression: pending role writes reject buffered draft changes and same-turn second saves', async () => {
  let resolve: ((value: ApiResult<unknown>) => void) | undefined;
  mocks.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const { result } = renderHook(() => useRoleEditor(initial));
  act(() => {
    result.current.setValues({ name: 'Reviewer', description: null, status: 'active' });
    result.current.setGrants(['permission-two']);
  });
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.save('metadata');
    void result.current.save('grants');
    result.current.setValues({ name: 'Late value', description: null, status: 'active' });
  });
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(result.current.phase).toBe('saving');
  await act(async () => {
    resolve?.(success({ ...initial, name: 'Reviewer', version: 8 }));
    await pending;
  });
  expect(result.current.values.name).toBe('Reviewer');
});

it.each([failure('request_timeout', 0, { uncertain: true }), failure('version_conflict', 409)])(
  'retains both drafts and pauses both writes until explicit current-state review',
  async (error) => {
    mocks.request
      .mockResolvedValueOnce(error)
      .mockResolvedValueOnce(success({ ...initial, name: 'Server change', version: 10 }));
    const { result } = renderHook(() => useRoleEditor(initial));
    act(() => {
      result.current.setValues({ name: 'Draft', description: 'Unsaved', status: 'disabled' });
      result.current.setGrants(['permission-two']);
    });
    await act(async () => {
      await result.current.save('metadata');
    });
    await act(async () => {
      await result.current.save('grants');
    });
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe('unconfirmed');
    await act(async () => {
      await result.current.readCurrent();
    });
    expect(result.current.confirmed.version).toBe(7);
    expect(result.current.latest?.version).toBe(10);
    act(() => result.current.adoptCurrent());
    expect(result.current.confirmed.version).toBe(10);
    expect(result.current.values).toEqual({
      name: 'Draft',
      description: 'Unsaved',
      status: 'disabled',
    });
    expect(result.current.grants).toEqual(['permission-two']);
  },
);

it('preserves the unconfirmed lock when reading current state fails and never discards the drafts', async () => {
  mocks.request
    .mockResolvedValueOnce(failure('request_failed', 0, { uncertain: true }))
    .mockResolvedValueOnce(failure('forbidden', 403));
  const { result } = renderHook(() => useRoleEditor(initial));
  act(() => result.current.setValues({ name: 'Draft', description: null, status: 'active' }));
  await act(async () => {
    await result.current.save('metadata');
    await result.current.readCurrent();
  });
  act(() => result.current.adoptCurrent());
  expect(result.current.phase).toBe('unconfirmed');
  expect(result.current.error?.status).toBe(403);
  expect(result.current.values.name).toBe('Draft');
});

it('allows correcting a confirmed validation failure and blocks super or missing read dependencies', async () => {
  mocks.request.mockResolvedValue(failure('invalid_input', 400));
  const { result, rerender } = renderHook(({ role }) => useRoleEditor(role), {
    initialProps: { role: initial },
  });
  act(() => result.current.setValues({ name: 'Draft', description: null, status: 'active' }));
  await act(async () => {
    await result.current.save('metadata');
  });
  expect(result.current.phase).toBe('idle');
  mocks.can.mockImplementation((id) => id !== 'roles.get');
  await act(async () => {
    await result.current.save('metadata');
    await result.current.readCurrent();
  });
  expect(mocks.request).toHaveBeenCalledOnce();
  rerender({ role: { ...initial, isSuper: true } });
});

it('keeps super roles read-only and aborts an unmounted pending request', async () => {
  const superRole = renderHook(() => useRoleEditor({ ...initial, isSuper: true }));
  act(() =>
    superRole.result.current.setValues({ name: 'Attempt', description: null, status: 'active' }),
  );
  await act(async () => {
    await superRole.result.current.save('metadata');
  });
  expect(mocks.request).not.toHaveBeenCalled();
  superRole.unmount();
  mocks.request.mockImplementation(() => new Promise(() => {}));
  const component = renderHook(() => useRoleEditor(initial));
  act(() => {
    component.result.current.setValues({ name: 'Draft', description: null, status: 'active' });
  });
  act(() => {
    void component.result.current.save('metadata');
  });
  const signal = mocks.request.mock.calls[0]?.[0].signal;
  component.unmount();
  expect(signal?.aborted).toBe(true);
});
