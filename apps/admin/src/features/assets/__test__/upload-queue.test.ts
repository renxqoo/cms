import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import {
  first,
  second,
  file,
  session,
  ok,
  deferred,
  manifest,
} from '../../../../test/support/admin-asset-data';
import { queueFixture } from './queue-support';
import type { ApiResult } from '../../../api/result';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('runs at most two uploads and reports real byte progress separately from processing and consumption', async () => {
  const { controller, services, onReady, onTerminal } = queueFixture();
  let created = 0;
  services.create.mockImplementation(() => {
    created += 1;
    return Promise.resolve(ok(session({ id: created === 1 ? first : second })));
  });
  const writes = new Map<
    string,
    ReturnType<typeof deferred<ApiResult<{ uploadId: string; bytes: number; digest: string }>>>
  >();
  services.write.mockImplementation((input) => {
    const pending = deferred<ApiResult<{ uploadId: string; bytes: number; digest: string }>>();
    writes.set(input.session.id, pending);
    input.onProgress({ loaded: 1, total: null });
    return pending.promise;
  });
  controller.start();
  controller.add([file('one.png'), file('two.png'), file('three.png')]);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.create).toHaveBeenCalledTimes(2);
  expect(controller.store.getState().items.map((item) => item.stage)).toEqual([
    'uploading',
    'uploading',
    'queued',
  ]);
  expect(controller.store.getState().items[0]?.progress).toEqual({ loaded: 1, total: null });
  writes.get(first)?.finish(ok({ uploadId: first, bytes: 4, digest: 'digest' }));
  writes.get(second)?.finish(ok({ uploadId: second, bytes: 4, digest: 'digest' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(services.create).toHaveBeenCalledTimes(2);
  expect(controller.store.getState().items.map((item) => item.stage)).toEqual([
    'processing',
    'processing',
    'queued',
  ]);
  expect(onReady).not.toHaveBeenCalled();
  expect(onTerminal).not.toHaveBeenCalled();
  controller.dispose();
});
it('reaches ready through actual read state and starts another queued file without claiming attachment', async () => {
  const { controller, services, onReady, onTerminal } = queueFixture({ concurrency: 1 });
  services.read.mockResolvedValueOnce(ok(session({ status: 'ready', manifest })));
  controller.start();
  controller.add([file('one.png'), file('two.png')]);
  await vi.advanceTimersByTimeAsync(0);
  expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
  expect(onTerminal).not.toHaveBeenCalled();
  expect(controller.store.getState().items.map((item) => item.stage)).toEqual([
    'ready',
    'processing',
  ]);
  expect(services.create).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it('a failed remote session retries with fresh create and completion idempotency keys', async () => {
  const { controller, services } = queueFixture();
  services.read.mockResolvedValueOnce(
    ok(session({ status: 'failed', failureCode: 'unsupported_media_type' })),
  );
  controller.start();
  controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  const previous = services.create.mock.calls[0]?.[0].key;
  const previousComplete = services.complete.mock.calls[0]?.[0].key;
  const id = controller.store.getState().items[0]?.id ?? '';
  controller.retry(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.create).toHaveBeenCalledTimes(2);
  expect(services.create.mock.calls[1]?.[0].key).not.toBe(previous);
  expect(services.complete.mock.calls[1]?.[0].key).not.toBe(previousComplete);
  expect(services.cancel).not.toHaveBeenCalled();
  controller.dispose();
});
it('unknown writes are never retransmitted and require actual cancellation before a fresh session', async () => {
  const { controller, services } = queueFixture();
  services.write.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  services.read
    .mockResolvedValueOnce(ok(session({ status: 'uploading' })))
    .mockResolvedValueOnce(ok(session({ status: 'cancelled' })));
  controller.start();
  controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  const id = controller.store.getState().items[0]?.id ?? '';
  expect(controller.store.getState().items[0]?.stage).toBe('blocked');
  controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.write).toHaveBeenCalledTimes(1);
  expect(services.complete).not.toHaveBeenCalled();
  expect(controller.store.getState().items[0]?.stage).toBe('blocked');
  controller.cancel(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.cancel).toHaveBeenCalledTimes(1);
  expect(controller.store.getState().items[0]?.stage).toBe('cancelled');
  controller.retry(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.create).toHaveBeenCalledTimes(2);
  expect(services.write).toHaveBeenCalledTimes(2);
  controller.dispose();
});
it('unknown completion resumes the same intent after reading the existing session', async () => {
  const { controller, services } = queueFixture();
  services.complete.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  services.read.mockResolvedValueOnce(ok(session({ status: 'uploading' })));
  controller.start();
  controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  const id = controller.store.getState().items[0]?.id ?? '';
  const key = services.complete.mock.calls[0]?.[0].key;
  controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.write).toHaveBeenCalledTimes(1);
  expect(services.complete).toHaveBeenCalledTimes(2);
  expect(services.complete.mock.calls[1]?.[0].key).toBe(key);
  controller.dispose();
});
it('reconstructs an unknown create with the same key for explicit cancellation without sending bytes', async () => {
  const { controller, services } = queueFixture();
  services.create.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  services.read.mockResolvedValue(ok(session({ status: 'cancelled' })));
  controller.start();
  controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  const id = controller.store.getState().items[0]?.id ?? '';
  const key = services.create.mock.calls[0]?.[0].key;
  controller.cancel(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.create.mock.calls[1]?.[0].key).toBe(key);
  expect(services.write).not.toHaveBeenCalled();
  expect(services.cancel).toHaveBeenCalledTimes(1);
  controller.dispose();
});
it('a replaced document keeps its exact expected revision and rejects wrong-session responses', async () => {
  const { controller, services } = queueFixture({
    purpose: 'replace',
    target: { id: second, revision: 9 },
  });
  controller.start();
  controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  expect(services.create).toHaveBeenCalledWith(
    expect.objectContaining({ purpose: 'replace', target: { id: second, revision: 9 } }),
  );
  expect(services.write).not.toHaveBeenCalled();
  expect(controller.store.getState().items[0]?.error?.error.code).toBe('invalid_response');
  controller.dispose();
});
it('aborts bytes and polling on disposal, preserves existing rows and does not start queued files', async () => {
  const { controller, services } = queueFixture({ concurrency: 1 });
  const writing = deferred<ApiResult<{ uploadId: string; bytes: number; digest: string }>>();
  services.write.mockReturnValue(writing.promise);
  controller.start();
  controller.add([file(), file('second.png')]);
  await vi.advanceTimersByTimeAsync(0);
  const signal = services.write.mock.calls[0]?.[0].signal;
  controller.dispose();
  expect(signal?.aborted).toBe(true);
  writing.finish(ok({ uploadId: first, bytes: 4, digest: 'digest' }));
  await vi.advanceTimersByTimeAsync(300000);
  expect(services.create).toHaveBeenCalledTimes(1);
  expect(services.complete).not.toHaveBeenCalled();
});
