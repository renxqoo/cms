import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { AssetJob } from '../../../contracts/assets';
import { createAssetDocumentWork } from '../document-work';
import {
  deferred,
  file,
  first,
  manifest,
  ok,
  second,
  session,
} from '../../../../test/support/admin-asset-data';
import type { ApiResult } from '../../../api/result';
import { workFixture } from './work-support';

const completed: AssetJob = {
  id: second,
  collection: 'images',
  action: 'reprocess',
  status: 'succeeded',
  attempts: 1,
  failureCode: null,
  uploadId: first,
  manifest,
};
function processing() {
  const test = workFixture();
  const work = createAssetDocumentWork({
    ...test.input,
    kind: 'reprocess',
    recipe: { variants: [] },
  });
  return { ...test, work };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('does not confirm a cancellation that returns a session from a different collection or revision', async () => {
  const { work, services, lease } = processing();
  services.uploads.read.mockResolvedValue(
    ok(
      session({
        purpose: 'replace',
        documentId: second,
        revision: 8,
        collection: 'other',
        status: 'cancelled',
      }),
    ),
  );
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  work.cancel();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.refresh).not.toHaveBeenCalled();
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  expect(work.store.getState().error?.error.code).toBe('invalid_response');
  work.dispose();
});
it('does not release replacement after explicit verification receives another collection or purpose', async () => {
  const { input, services, lease } = workFixture();
  services.uploads.create.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9 })),
  );
  services.uploads.write.mockResolvedValue(failure('request_timeout', 0, { uncertain: true }));
  services.uploads.read.mockResolvedValue(
    ok(
      session({
        collection: 'other',
        purpose: 'create',
        documentId: second,
        revision: 9,
        status: 'consumed',
        manifest,
      }),
    ),
  );
  const work = createAssetDocumentWork({ ...input, kind: 'replace', file: file() });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  expect(lease.refresh).not.toHaveBeenCalled();
  expect(lease.consumeUpload).not.toHaveBeenCalled();
  work.dispose();
});
it('honors Retry-After for rejected processing without starting a new processing job when cancelled', async () => {
  const { work, services, lease } = processing();
  services.reprocess.mockResolvedValue({ ...failure('rate_limited', 429), retryAfterSeconds: 30 });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  work.verify();
  work.cancel();
  await vi.advanceTimersByTimeAsync(29999);
  expect(lease.refresh).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  work.cancel();
  await vi.advanceTimersByTimeAsync(0);
  expect(services.reprocess).toHaveBeenCalledTimes(1);
  expect(services.uploads.cancel).not.toHaveBeenCalled();
  expect(work.store.getState().phase).toBe('failed');
  expect(lease.finish.mock.calls.map(([value]) => value)).toEqual(['blocked', 'confirmed']);
  work.dispose();
});
it('recovers an unknown processing receipt for cancellation using the original idempotency key', async () => {
  const { work, services, lease } = processing();
  services.reprocess.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  services.uploads.read.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'cancelled' })),
  );
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  work.cancel();
  await vi.advanceTimersByTimeAsync(0);
  expect(services.reprocess.mock.calls[1]?.[0].key).toBe(services.reprocess.mock.calls[0]?.[0].key);
  expect(services.uploads.cancel).toHaveBeenCalledTimes(1);
  expect(lease.finish.mock.calls.map(([value]) => value)).toEqual(['blocked', 'confirmed']);
  work.dispose();
});
it.each(['id', 'collection', 'uploadId', 'action'] as const)(
  'rejects job %s mismatch before reading a terminal session',
  async (key) => {
    const { work, services, lease } = processing();
    const wrong = { ...completed, [key]: key === 'action' ? 'process' : 'wrong' };
    services.job.mockResolvedValue(ok(wrong));
    work.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(services.uploads.read).not.toHaveBeenCalled();
    expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    expect(work.store.getState().error?.error.code).toBe('invalid_response');
    work.dispose();
  },
);
it.each(['failure', 'mismatch', 'throw'] as const)(
  'keeps terminal processing blocked when session verification returns %s',
  async (outcome) => {
    const { work, services, lease } = processing();
    services.job.mockResolvedValue(ok(completed));
    if (outcome === 'failure') services.uploads.read.mockResolvedValue(failure('forbidden', 403));
    else if (outcome === 'throw') services.uploads.read.mockRejectedValue(new Error('offline'));
    else
      services.uploads.read.mockResolvedValue(
        ok(
          session({
            purpose: 'replace',
            documentId: second,
            revision: 9,
            status: 'ready',
            manifest,
          }),
        ),
      );
    work.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(lease.refresh).not.toHaveBeenCalled();
    expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    work.dispose();
  },
);
it.each(['cancelled', 'expired'] as const)(
  'recognizes %s processing only after matching terminal upload and refresh',
  async (status) => {
    const { work, services, lease } = processing();
    services.job.mockResolvedValue(ok({ ...completed, status: 'cancelled', manifest: null }));
    services.uploads.read.mockResolvedValue(
      ok(session({ purpose: 'replace', documentId: second, revision: 9, status })),
    );
    work.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(work.store.getState().phase).toBe('cancelled');
    expect(lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
    work.dispose();
  },
);
it('contains thrown processing requests and failed refreshes without losing the lease recovery path', async () => {
  const { work, services, lease } = processing();
  services.reprocess.mockRejectedValueOnce(new Error('offline'));
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  services.job.mockResolvedValue(ok(completed));
  lease.refresh.mockRejectedValueOnce(new Error('offline'));
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledTimes(1);
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish.mock.calls.map(([value]) => value)).toEqual(['blocked', 'confirmed']);
  work.dispose();
});
it('a terminal processing read that completes after disposal cannot refresh or confirm the lease', async () => {
  const { work, services, lease } = processing();
  services.job.mockResolvedValue(ok(completed));
  const read = deferred<ApiResult<ReturnType<typeof session>>>();
  services.uploads.read.mockReturnValue(read.promise);
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  work.dispose();
  read.finish(
    ok(
      session({
        purpose: 'replace',
        documentId: second,
        revision: 9,
        status: 'consumed',
        manifest,
      }),
    ),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.refresh).not.toHaveBeenCalled();
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
});
it('ends automatic processing after five minutes and aborts requests when its owner revokes the lease', async () => {
  const { work, services, lease, parent } = processing();
  work.start();
  await vi.advanceTimersByTimeAsync(300000);
  expect(work.store.getState()).toMatchObject({ phase: 'blocked', paused: 'deadline' });
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  const signal = services.job.mock.calls.at(-1)?.[0].signal;
  parent.abort();
  expect(signal?.aborted).toBe(true);
  expect(work.store.getState().error?.error.code).toBe('request_cancelled');
  work.dispose();
});
it.each(['failure', 'throw', 'read-failure', 'not-cancelled'] as const)(
  'keeps a processing lease locked when remote cancellation is %s',
  async (outcome) => {
    const { work, services, lease } = processing();
    if (outcome === 'failure') services.uploads.cancel.mockResolvedValue(failure('forbidden', 403));
    if (outcome === 'throw') services.uploads.cancel.mockRejectedValue(new Error('offline'));
    if (outcome === 'read-failure')
      services.uploads.read.mockResolvedValue(failure('request_failed', 0));
    if (outcome === 'not-cancelled')
      services.uploads.read.mockResolvedValue(
        ok(
          session({
            purpose: 'replace',
            documentId: second,
            revision: 9,
            status: 'ready',
            manifest,
          }),
        ),
      );
    work.start();
    await vi.advanceTimersByTimeAsync(0);
    work.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(lease.refresh).not.toHaveBeenCalled();
    expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    work.dispose();
  },
);
