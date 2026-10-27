import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../../api/result';
import { failure } from '../../../api/result';
import type { EditorLease } from '../../../contracts/collaboration';
import { createEditorLeaseController } from '../editor-lease';
import { deferred } from './support';
import type { requestApi } from '../../../api/client';

const api = vi.hoisted(() => ({
  request: vi.fn<(input: Parameters<typeof requestApi>[0]) => Promise<ApiResult<EditorLease>>>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: api.request }));
const editorId = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const actorId = '33333333-3333-4333-8333-333333333333';
const controllers: ReturnType<typeof createEditorLeaseController>[] = [];
function owned(changes: Partial<EditorLease> = {}): EditorLease {
  return {
    enabled: true,
    owned: true,
    durationMs: 300000,
    heartbeatMs: 30000,
    lease: {
      actorId,
      generation: 1,
      displayName: 'Editor',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    },
    ...changes,
  };
}
const ok = (data: EditorLease): ApiResult<EditorLease> => ({
  ok: true,
  status: 200,
  data,
  requestId: 'request',
});
beforeEach(() => {
  vi.useFakeTimers();
  api.request.mockReset();
});
afterEach(async () => {
  for (const controller of controllers.splice(0)) controller.dispose();
  await Promise.resolve();
  vi.useRealTimers();
});
function fixture() {
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const controller = createEditorLeaseController({
    collection: 'articles',
    id,
    editorId,
    report,
    locale: 'en',
  });
  controllers.push(controller);
  return { controller, report };
}

it('renews its own lease and stops writing after another tab takes over', async () => {
  api.request.mockResolvedValue(ok(owned()));
  const { controller } = fixture();
  await controller.start();
  expect(controller.store.getState().phase).toBe('owned');
  await vi.advanceTimersByTimeAsync(30000);
  expect(api.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'documents.acquireLock',
      body: { editorId, generation: 1, locale: 'en' },
    }),
  );
  api.request.mockResolvedValue(ok(owned({ owned: false })));
  await vi.advanceTimersByTimeAsync(30000);
  expect(controller.store.getState().phase).toBe('occupied');
  const count = api.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(300000);
  expect(api.request).toHaveBeenCalledTimes(count);
  controller.dispose();
  expect(api.request.mock.calls.at(-1)?.[0]).toMatchObject({ operation: 'documents.acquireLock' });
});

it('pauses on failed authorization, retries explicitly and takes over the displayed generation', async () => {
  api.request.mockResolvedValueOnce(failure('forbidden', 403));
  const { controller, report } = fixture();
  await controller.start();
  expect(controller.store.getState()).toMatchObject({ phase: 'paused', error: { status: 403 } });
  expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  api.request.mockResolvedValueOnce(ok(owned({ owned: false })));
  await controller.retry();
  expect(controller.store.getState().phase).toBe('occupied');
  api.request.mockResolvedValueOnce(
    ok(
      owned({
        lease: {
          actorId,
          generation: 2,
          displayName: 'Editor',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
        },
      }),
    ),
  );
  await controller.takeover();
  expect(api.request).toHaveBeenLastCalledWith(
    expect.objectContaining({
      operation: 'documents.unlock',
      body: { editorId, generation: 1, locale: 'en' },
    }),
  );
  expect(controller.store.getState().phase).toBe('owned');
});

it('expires an unconfirmed renewal, aborts its request and ignores a late success', async () => {
  const completion = deferred<ApiResult<EditorLease>>();
  api.request
    .mockResolvedValueOnce(ok(owned()))
    .mockImplementationOnce(() => completion.promise)
    .mockResolvedValue(ok(owned()));
  const { controller } = fixture();
  await controller.start();
  await vi.advanceTimersByTimeAsync(300000);
  expect(api.request.mock.calls[1]?.[0].signal.aborted).toBe(true);
  expect(controller.store.getState().phase).toBe('paused');
  completion.resolve(ok(owned()));
  await Promise.resolve();
  expect(controller.store.getState().phase).toBe('paused');
});

it('serializes release and restart and never lets disposed responses restart timers', async () => {
  const releasing = deferred<ApiResult<EditorLease>>();
  api.request
    .mockResolvedValueOnce(ok(owned()))
    .mockImplementationOnce(() => releasing.promise)
    .mockResolvedValue(ok(owned()));
  const { controller } = fixture();
  await controller.start();
  controller.dispose();
  const restarting = controller.start();
  await Promise.resolve();
  expect(api.request).toHaveBeenCalledTimes(2);
  releasing.resolve(ok(owned({ owned: false, lease: null })));
  await restarting;
  expect(controller.store.getState().phase).toBe('owned');
  controller.dispose();
  const count = api.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(900000);
  expect(api.request).toHaveBeenCalledTimes(count);
  await controller.retry();
  expect(api.request).toHaveBeenCalledTimes(count);
});

it('does not manufacture an unlock target before a lease is known', async () => {
  const { controller } = fixture();
  await controller.takeover();
  expect(api.request).not.toHaveBeenCalled();
  controller.dispose();
  expect(api.request).not.toHaveBeenCalled();
});
