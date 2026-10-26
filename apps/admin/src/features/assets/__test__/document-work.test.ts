import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
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
import { workFixture } from './work-support';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('holds one replacement lease through byte processing, upload consumption and confirmed document refresh', async () => {
  const { input, services, lease } = workFixture();
  services.uploads.create.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9 })),
  );
  services.uploads.complete.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'processing' })),
  );
  services.uploads.read
    .mockResolvedValueOnce(
      ok(
        session({ purpose: 'replace', documentId: second, revision: 9, status: 'ready', manifest }),
      ),
    )
    .mockResolvedValueOnce(
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
  const refreshing = deferred<ApiResult<unknown>>();
  lease.refresh.mockReturnValue(refreshing.promise);
  const work = createAssetDocumentWork({ ...input, kind: 'replace', file: file() });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.consumeUpload).toHaveBeenCalledWith(first, expect.any(AbortSignal));
  expect(lease.finish).not.toHaveBeenCalled();
  expect(work.store.getState().phase).toBe('refreshing');
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.refresh).toHaveBeenCalledTimes(1);
  refreshing.finish(ok({}));
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  expect(work.store.getState().phase).toBe('succeeded');
  work.dispose();
  expect(lease.finish).toHaveBeenCalledTimes(1);
});
it('202 reprocessing acceptance never consumes uploadId and releases only after job terminal plus refresh', async () => {
  const { input, services, lease } = workFixture();
  const work = createAssetDocumentWork({ ...input, kind: 'reprocess', recipe: { variants: [] } });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(work.store.getState().phase).toBe('processing');
  expect(lease.finish).not.toHaveBeenCalled();
  expect(lease.consumeUpload).not.toHaveBeenCalled();
  services.job.mockResolvedValue(
    ok({
      id: second,
      collection: 'images',
      action: 'reprocess',
      status: 'succeeded',
      attempts: 1,
      failureCode: null,
      uploadId: first,
      manifest,
    }),
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(lease.refresh).toHaveBeenCalledTimes(1);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  expect(lease.consumeUpload).not.toHaveBeenCalled();
  work.dispose();
});
it('unknown reprocessing reuses the same intent while keeping the original lease signal alive', async () => {
  const { input, services, lease, parent } = workFixture();
  services.reprocess.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  const work = createAssetDocumentWork({ ...input, kind: 'reprocess', recipe: { variants: [] } });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  expect(parent.signal.aborted).toBe(false);
  const key = services.reprocess.mock.calls[0]?.[0].key;
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(services.reprocess.mock.calls[1]?.[0].key).toBe(key);
  services.job.mockResolvedValue(
    ok({
      id: second,
      collection: 'images',
      action: 'reprocess',
      status: 'succeeded',
      attempts: 1,
      failureCode: null,
      uploadId: first,
      manifest,
    }),
  );
  await vi.advanceTimersByTimeAsync(5000);
  expect(lease.finish.mock.calls.map(([outcome]) => outcome)).toEqual(['blocked', 'confirmed']);
  expect(parent.signal.aborted).toBe(true);
  work.dispose();
});
it('unknown replacement consumption checks consumed state before any repeated document mutation', async () => {
  const { input, services, lease } = workFixture();
  services.uploads.create.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9 })),
  );
  services.uploads.complete.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'ready', manifest })),
  );
  lease.consumeUpload.mockResolvedValueOnce(failure('request_timeout', 0, { uncertain: true }));
  services.uploads.read.mockResolvedValue(
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
  const work = createAssetDocumentWork({ ...input, kind: 'replace', file: file() });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.consumeUpload).toHaveBeenCalledTimes(1);
  expect(lease.finish.mock.calls.map(([outcome]) => outcome)).toEqual(['blocked', 'confirmed']);
  work.dispose();
});
it('known rejected processing preserves the error and original file, and refreshes before releasing the lease', async () => {
  const { input, services, lease } = workFixture();
  services.reprocess.mockResolvedValue(failure('invalid_input', 400));
  const work = createAssetDocumentWork({ ...input, kind: 'reprocess', recipe: { variants: [] } });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(work.store.getState()).toMatchObject({
    phase: 'failed',
    error: { error: { code: 'invalid_input' } },
  });
  expect(lease.refresh).toHaveBeenCalledTimes(1);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  expect(services.job).not.toHaveBeenCalled();
  expect(lease.consumeUpload).not.toHaveBeenCalled();
  work.dispose();
});
it('failed processing keeps the original file and reaches failed rather than successful state', async () => {
  const { input, services, lease } = workFixture();
  services.job.mockResolvedValue(
    ok({
      id: second,
      collection: 'images',
      action: 'reprocess',
      status: 'failed',
      attempts: 2,
      failureCode: 'unsupported_media_type',
      uploadId: first,
      manifest: null,
    }),
  );
  services.uploads.read.mockResolvedValue(
    ok(
      session({
        purpose: 'replace',
        documentId: second,
        revision: 9,
        status: 'failed',
        failureCode: 'unsupported_media_type',
      }),
    ),
  );
  const work = createAssetDocumentWork({ ...input, kind: 'reprocess', recipe: { variants: [] } });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(work.store.getState()).toMatchObject({
    phase: 'failed',
    job: { failureCode: 'unsupported_media_type' },
  });
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  expect(lease.consumeUpload).not.toHaveBeenCalled();
  work.dispose();
});
it('cancellation must confirm the remote upload and refresh before releasing a processing lease', async () => {
  const { input, services, lease } = workFixture();
  services.uploads.read.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'cancelled' })),
  );
  const work = createAssetDocumentWork({ ...input, kind: 'reprocess', recipe: { variants: [] } });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  work.cancel();
  await vi.advanceTimersByTimeAsync(0);
  expect(services.uploads.cancel).toHaveBeenCalledWith(
    expect.objectContaining({ uploadId: first }),
  );
  expect(lease.refresh).toHaveBeenCalledTimes(1);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  expect(work.store.getState().phase).toBe('cancelled');
  work.dispose();
});
it('a failed authoritative refresh keeps the same lease blocked until a later verification succeeds', async () => {
  const { input, services, lease, parent } = workFixture();
  services.job.mockResolvedValue(
    ok({
      id: second,
      collection: 'images',
      action: 'reprocess',
      status: 'succeeded',
      attempts: 1,
      failureCode: null,
      uploadId: first,
      manifest,
    }),
  );
  lease.refresh.mockResolvedValueOnce(failure('request_failed', 0));
  const work = createAssetDocumentWork({ ...input, kind: 'reprocess', recipe: { variants: [] } });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  expect(parent.signal.aborted).toBe(false);
  work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(lease.finish.mock.calls.map(([outcome]) => outcome)).toEqual(['blocked', 'confirmed']);
  work.dispose();
});
it('lease revision mismatches never upload or reprocess, and cleanup aborts local work without claiming remote cancellation', async () => {
  const { input, services, lease } = workFixture();
  const work = createAssetDocumentWork({ ...input, revision: 8, kind: 'replace', file: file() });
  work.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(services.uploads.create).not.toHaveBeenCalled();
  expect(lease.finish.mock.calls.map(([outcome]) => outcome)).toEqual(['blocked', 'confirmed']);
  work.dispose();
  const fresh = workFixture();
  const running = createAssetDocumentWork({
    ...fresh.input,
    kind: 'reprocess',
    recipe: { variants: [] },
  });
  running.start();
  await vi.advanceTimersByTimeAsync(0);
  const signal = fresh.services.job.mock.calls[0]?.[0].signal;
  running.dispose();
  expect(signal?.aborted).toBe(true);
  expect(fresh.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  expect(fresh.services.uploads.cancel).not.toHaveBeenCalled();
});
