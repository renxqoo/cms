import { afterEach, expect, it, vi } from 'vitest';
import {
  managementEndpoint,
  managementPermission,
  managementSuccess,
} from '../../../../../../test/support/admin-management';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/client';
import type { Binding } from '../../../contracts/access';
import {
  recoveryEndpointSource,
  recoveryPermissionSource,
  recoveryBindingSource,
  bindingTarget,
} from '../recovery-read';
import { bindingReadSource } from '../binding-read';

interface Input {
  operation: string;
  query?: Record<string, unknown>;
  response: unknown;
  signal: AbortSignal;
}
const api = vi.hoisted(() => ({ request: vi.fn<(input: Input) => Promise<ApiResult<unknown>>>() }));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
afterEach(() => vi.resetAllMocks());
const binding: Binding = {
  id: '33333333-3333-4333-8333-333333333333',
  version: 15,
  operationId: 'removed.operation',
  scopeKind: 'collection',
  collectionKey: 'removed',
  permissionId: '22222222-2222-4222-8222-222222222222',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
};

it('uses independent security reads and finds a permission beyond the first full page', async () => {
  const first = Array.from({ length: 100 }, (_, index) =>
    managementPermission({ id: `77777777-7777-4777-8777-${String(index).padStart(12, '0')}` }),
  );
  api.request
    .mockResolvedValueOnce(
      managementSuccess({
        resource: 'permissions',
        rows: first,
        page: 1,
        pageSize: 100,
        total: 101,
      }),
    )
    .mockResolvedValueOnce(
      managementSuccess({
        resource: 'permissions',
        rows: [managementPermission({ version: 14 })],
        page: 2,
        pageSize: 100,
        total: 101,
      }),
    );
  const result = await recoveryPermissionSource.find({
    id: managementPermission().id,
    signal: new AbortController().signal,
  });
  expect(result.ok && result.data.version).toBe(14);
  expect(
    api.request.mock.calls.map(([input]) => ({ operation: input.operation, query: input.query })),
  ).toEqual([
    {
      operation: 'access.readRecovery',
      query: { resource: 'permissions', page: 1, pageSize: 100 },
    },
    {
      operation: 'access.readRecovery',
      query: { resource: 'permissions', page: 2, pageSize: 100 },
    },
  ]);
});

it('reads orphan binding versions from persistent bindings without fabricating an endpoint path', async () => {
  api.request.mockResolvedValue(
    managementSuccess({ resource: 'bindings', rows: [binding], page: 1, pageSize: 100, total: 1 }),
  );
  const result = await recoveryBindingSource.read(
    bindingTarget({ ...binding, version: 2 }),
    new AbortController().signal,
  );
  expect(result.ok && result.data).toEqual({
    operationId: 'removed.operation',
    scopeKind: 'collection',
    collectionKey: 'removed',
    binding: { id: binding.id, permissionId: binding.permissionId, version: 15 },
  });
  expect(result.ok && result.data).not.toHaveProperty('path');
});

it('confirms persistent absence and propagates security read failures without changing the write target', async () => {
  api.request
    .mockResolvedValueOnce(
      managementSuccess({ resource: 'bindings', rows: [], total: 0, page: 1, pageSize: 100 }),
    )
    .mockResolvedValueOnce(failure('forbidden', 403))
    .mockResolvedValueOnce(
      managementSuccess({ resource: 'permissions', rows: [], total: 0, page: 1, pageSize: 100 }),
    );
  expect(
    await recoveryBindingSource.read(bindingTarget(binding), new AbortController().signal),
  ).toMatchObject({ ok: true, data: null });
  expect(await recoveryEndpointSource.read(new AbortController().signal)).toMatchObject({
    ok: false,
    status: 403,
  });
  expect(
    await recoveryPermissionSource.find({
      id: managementPermission().id,
      signal: new AbortController().signal,
    }),
  ).toMatchObject({ ok: false, error: { code: 'not_found' } });
});

it('regression: removal from the operation catalog alone does not prove persistent binding deletion', async () => {
  api.request.mockResolvedValue(managementSuccess({ rows: [], total: 0, page: 1, pageSize: 100 }));
  expect(
    await bindingReadSource.read(managementEndpoint(), new AbortController().signal),
  ).toMatchObject({ ok: false, error: { code: 'not_found' } });
});
