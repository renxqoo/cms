import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import type { UploadSession } from '../../../contracts/assets';
import {
  deferred,
  file,
  first,
  manifest,
  ok,
  second,
  session,
} from '../../../../test/support/admin-asset-data';
import { queueFixture } from './queue-support';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function idOf(test: ReturnType<typeof queueFixture>) {
  return test.controller.store.getState().items[0]?.id ?? '';
}
it('rejects invalid local bytes without creating remote sessions and removes queued files without cancelling remotely', async () => {
  const test = queueFixture({ concurrency: 1 });
  test.controller.add([
    new File([], 'empty.png', { type: 'image/png' }),
    new File(['x'], 'wrong.txt', { type: 'text/plain' }),
    new File(['x'.repeat(101)], 'large.png', { type: 'image/png' }),
  ]);
  test.controller.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(test.controller.store.getState().items.map((item) => item.stage)).toEqual([
    'failed',
    'failed',
    'failed',
  ]);
  expect(test.services.create).not.toHaveBeenCalled();
  test.controller.remove(idOf(test));
  expect(test.controller.store.getState().items).toHaveLength(2);
  test.controller.dispose();
  const queued = queueFixture();
  queued.controller.start();
  queued.controller.add([file()]);
  queued.controller.cancel(idOf(queued));
  await vi.advanceTimersByTimeAsync(0);
  expect(queued.controller.store.getState().items[0]?.stage).toBe('cancelled');
  expect(queued.services.cancel).not.toHaveBeenCalled();
  queued.controller.remove(idOf(queued));
  expect(queued.controller.store.getState().items).toHaveLength(0);
  queued.controller.dispose();
});
it('caps waiting rows, ignores missing row actions and cannot remove a ready upload before remote cancellation', async () => {
  const test = queueFixture();
  test.services.create.mockResolvedValue(ok(session({ status: 'ready', manifest })));
  test.controller.add(Array.from({ length: 21 }, () => file()));
  expect(test.controller.store.getState().items).toHaveLength(20);
  test.controller.start();
  await vi.advanceTimersByTimeAsync(0);
  const id = idOf(test);
  test.controller.remove(id);
  test.controller.retry(id);
  test.controller.verify('missing');
  test.controller.cancel('missing');
  test.controller.remove('missing');
  test.controller.retry('missing');
  expect(test.controller.store.getState().items).toHaveLength(20);
  expect(test.services.write).not.toHaveBeenCalled();
  test.controller.dispose();
});
it.each([
  { uploadId: second, bytes: 4 },
  { uploadId: first, bytes: 3 },
])(
  'blocks a byte acknowledgement that does not identify the exact sent file: %j',
  async (written) => {
    const test = queueFixture();
    test.services.write.mockResolvedValue(ok({ ...written, digest: 'digest' }));
    test.controller.start();
    test.controller.add([file()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(test.controller.store.getState().items[0]).toMatchObject({
      stage: 'blocked',
      error: { error: { code: 'invalid_response' } },
    });
    expect(test.services.complete).not.toHaveBeenCalled();
    test.controller.dispose();
  },
);
it('stops mismatched processing responses and does not keep polling a foreign upload', async () => {
  const test = queueFixture();
  test.services.read.mockResolvedValue(ok(session({ id: second, status: 'processing' })));
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.controller.store.getState().items[0]?.stage).toBe('blocked');
  await vi.advanceTimersByTimeAsync(30000);
  expect(test.services.read).toHaveBeenCalledTimes(1);
  test.controller.dispose();
});
it('enforces Retry-After on verification and cancellation without repeated create requests', async () => {
  const test = queueFixture();
  test.services.create.mockResolvedValueOnce({
    ...failure('rate_limited', 429),
    retryAfterSeconds: 30,
  });
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  const id = idOf(test);
  test.controller.verify(id);
  test.controller.cancel(id);
  await vi.advanceTimersByTimeAsync(29999);
  expect(test.services.create).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  test.controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.create).toHaveBeenCalledTimes(2);
  expect(test.services.create.mock.calls[1]?.[0].key).toBe(
    test.services.create.mock.calls[0]?.[0].key,
  );
  test.controller.dispose();
});
it('known byte rejection requires confirmed cancellation before retrying with a new session', async () => {
  const test = queueFixture();
  test.services.write.mockResolvedValueOnce(failure('invalid_input', 400));
  test.services.read.mockResolvedValueOnce(ok(session({ status: 'cancelled' })));
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  test.controller.retry(idOf(test));
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.cancel).toHaveBeenCalledTimes(1);
  expect(test.services.create).toHaveBeenCalledTimes(2);
  expect(test.services.create.mock.calls[1]?.[0].key).not.toBe(
    test.services.create.mock.calls[0]?.[0].key,
  );
  test.controller.dispose();
});
it.each(['failure', 'throw', 'read-failure', 'wrong-id', 'not-terminal'] as const)(
  'does not claim upload cancellation after %s',
  async (outcome) => {
    const test = queueFixture();
    if (outcome === 'failure') test.services.cancel.mockResolvedValue(failure('forbidden', 403));
    if (outcome === 'throw') test.services.cancel.mockRejectedValue(new Error('offline'));
    test.controller.start();
    test.controller.add([file()]);
    await vi.advanceTimersByTimeAsync(0);
    if (outcome === 'read-failure')
      test.services.read.mockResolvedValue(failure('request_failed', 0));
    else
      test.services.read.mockResolvedValue(
        ok(
          session({
            id: outcome === 'wrong-id' ? second : first,
            status: outcome === 'not-terminal' ? 'ready' : 'cancelled',
            manifest,
          }),
        ),
      );
    test.controller.cancel(idOf(test));
    await vi.advanceTimersByTimeAsync(0);
    expect(test.onTerminal).not.toHaveBeenCalled();
    expect(test.controller.store.getState().items[0]?.stage).not.toBe('cancelled');
    test.controller.dispose();
  },
);
it('verifies a ready session without resending completed bytes and handles failed explicit reads', async () => {
  const test = queueFixture();
  test.services.complete.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  const id = idOf(test);
  test.services.read.mockResolvedValueOnce(failure('forbidden', 403));
  test.controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.controller.store.getState().items[0]?.error?.status).toBe(403);
  test.services.read.mockResolvedValueOnce(ok(session({ status: 'ready', manifest })));
  test.controller.verify(id);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.onReady).toHaveBeenCalledTimes(1);
  expect(test.services.write).toHaveBeenCalledTimes(1);
  test.controller.dispose();
});
it('contains thrown create and explicit reads while preserving uncertainty for user verification', async () => {
  const test = queueFixture();
  test.services.create.mockRejectedValueOnce(new Error('offline'));
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.controller.store.getState().items[0]?.stage).toBe('blocked');
  test.controller.verify(idOf(test));
  await vi.advanceTimersByTimeAsync(0);
  test.controller.dispose();
  test.controller.start();
  await vi.advanceTimersByTimeAsync(0);
  test.services.read.mockRejectedValueOnce(new Error('offline'));
  test.controller.verify(idOf(test));
  await vi.advanceTimersByTimeAsync(0);
  expect(test.controller.store.getState().items[0]?.error?.error.code).toBe('request_failed');
  test.controller.dispose();
});
it('restarts an aborted create with the same intent but never retransmits an aborted byte write', async () => {
  const test = queueFixture();
  const pending = deferred<ApiResult<UploadSession>>();
  test.services.create.mockReturnValueOnce(pending.promise);
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  test.controller.dispose();
  test.controller.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.create.mock.calls[1]?.[0].key).toBe(
    test.services.create.mock.calls[0]?.[0].key,
  );
  pending.finish(ok(session()));
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.write).toHaveBeenCalledTimes(1);
  test.controller.dispose();
  const bytes = queueFixture();
  bytes.services.write.mockImplementation(() => new Promise(() => {}));
  bytes.controller.start();
  bytes.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  bytes.controller.dispose();
  bytes.controller.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(bytes.controller.store.getState().items[0]?.stage).toBe('blocked');
  expect(bytes.services.write).toHaveBeenCalledTimes(1);
  bytes.controller.dispose();
});
