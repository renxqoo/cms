import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import type { AssetJob, UploadSession } from '../../../contracts/assets';
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
function processing() {
  const test = workFixture();
  const work = createAssetDocumentWork({
    ...test.input,
    kind: 'reprocess',
    recipe: { variants: [] },
  });
  return { ...test, work };
}
function replacement() {
  const test = workFixture();
  test.services.uploads.create.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9 })),
  );
  test.services.uploads.complete.mockResolvedValue(
    ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'ready', manifest })),
  );
  const work = createAssetDocumentWork({ ...test.input, kind: 'replace', file: file() });
  return { ...test, work };
}
it.each(['assets.reprocess', 'assets.cancelUpload', 'assets.readUpload', 'content.getJob'])(
  'cannot replay unknown image processing from verify or cancel after %s permission is revoked',
  async (operation) => {
    const test = processing();
    test.services.reprocess.mockResolvedValueOnce(
      failure('request_timeout', 0, { uncertain: true }),
    );
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    test.work.verify();
    test.work.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.reprocess).toHaveBeenCalledTimes(1);
    expect(test.services.uploads.cancel).not.toHaveBeenCalled();
    expect(test.lease.refresh).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.denied.clear();
    test.work.verify();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.reprocess.mock.calls[1]?.[0].key).toBe(
      test.services.reprocess.mock.calls[0]?.[0].key,
    );
    test.work.dispose();
  },
);
it('continues reading an accepted job and confirms its terminal state when only write permission is revoked', async () => {
  const test = processing();
  test.work.start();
  await vi.advanceTimersByTimeAsync(0);
  test.denied.add('assets.reprocess');
  const done: AssetJob = {
    id: second,
    collection: 'images',
    action: 'reprocess',
    status: 'succeeded',
    attempts: 1,
    failureCode: null,
    uploadId: first,
    manifest,
  };
  test.services.job.mockResolvedValue(ok(done));
  test.work.verify();
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.reprocess).toHaveBeenCalledTimes(1);
  expect(test.work.store.getState().phase).toBe('succeeded');
  expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('confirmed');
  test.work.dispose();
});
it.each(['content.getJob', 'assets.readUpload'])(
  'does not perform additional job reads while required %s permission is unavailable',
  async (operation) => {
    const test = processing();
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    test.work.verify();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.job).toHaveBeenCalledTimes(1);
    expect(test.lease.refresh).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.work.dispose();
  },
);
it('unknown replacement creation cannot recreate its receipt without current create permission', async () => {
  const test = replacement();
  test.services.uploads.create.mockResolvedValueOnce(
    failure('request_timeout', 0, { uncertain: true }),
  );
  test.work.start();
  await vi.advanceTimersByTimeAsync(0);
  test.denied.add('assets.createUpload');
  test.work.verify();
  test.work.cancel();
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.uploads.create).toHaveBeenCalledTimes(1);
  expect(test.services.uploads.write).not.toHaveBeenCalled();
  expect(test.lease.refresh).not.toHaveBeenCalled();
  expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
  test.work.dispose();
});
it.each(['assets.writeUpload', 'assets.readUpload'])(
  'does not send bytes after %s is revoked while create is in flight',
  async (operation) => {
    const test = replacement();
    const pending = deferred<ApiResult<UploadSession>>();
    test.services.uploads.create.mockReturnValue(pending.promise);
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    pending.finish(ok(session({ purpose: 'replace', documentId: second, revision: 9 })));
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.uploads.write).not.toHaveBeenCalled();
    expect(test.services.uploads.complete).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.work.dispose();
  },
);
it.each(['assets.completeUpload', 'assets.readUpload'])(
  'does not complete uploaded bytes after %s is revoked',
  async (operation) => {
    const test = replacement();
    const written = deferred<ApiResult<{ uploadId: string; bytes: number; digest: string }>>();
    test.services.uploads.write.mockReturnValue(written.promise);
    test.services.uploads.read.mockResolvedValue(
      ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'uploading' })),
    );
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    written.finish(ok({ uploadId: session().id, bytes: 4, digest: 'digest' }));
    await vi.advanceTimersByTimeAsync(0);
    test.work.verify();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.uploads.complete).not.toHaveBeenCalled();
    expect(test.lease.consumeUpload).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.work.dispose();
  },
);
it.each(['documents.update', 'assets.readUpload'])(
  'never consumes a ready replacement after %s is revoked while completion is in flight',
  async (operation) => {
    const test = replacement();
    const ready = deferred<ApiResult<UploadSession>>();
    test.services.uploads.complete.mockReturnValue(ready.promise);
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    ready.finish(
      ok(
        session({ purpose: 'replace', documentId: second, revision: 9, status: 'ready', manifest }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(test.lease.consumeUpload).not.toHaveBeenCalled();
    expect(test.lease.refresh).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.work.dispose();
  },
);
it.each(['assets.cancelUpload', 'assets.readUpload'])(
  'cannot cancel accepted processing without %s and preserves its receipt for later recovery',
  async (operation) => {
    const test = processing();
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    test.work.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.uploads.cancel).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.denied.clear();
    test.services.uploads.read.mockResolvedValue(
      ok(session({ purpose: 'replace', documentId: second, revision: 9, status: 'cancelled' })),
    );
    test.work.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.reprocess).toHaveBeenCalledTimes(1);
    expect(test.lease.finish.mock.calls.map(([value]) => value)).toEqual(['blocked', 'confirmed']);
    test.work.dispose();
  },
);
it('checks replacement cancellation permission again before issuing its remote DELETE', async () => {
  const test = replacement();
  test.services.uploads.write.mockResolvedValue(failure('request_timeout', 0, { uncertain: true }));
  test.work.start();
  await vi.advanceTimersByTimeAsync(0);
  test.denied.add('assets.cancelUpload');
  test.work.cancel();
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.uploads.cancel).not.toHaveBeenCalled();
  expect(test.lease.refresh).not.toHaveBeenCalled();
  test.work.dispose();
});
it.each(['assets.reprocess', 'assets.cancelUpload'])(
  'cancel alone cannot reconstruct an unknown processing receipt after %s is revoked',
  async (operation) => {
    const test = processing();
    test.services.reprocess.mockResolvedValueOnce(
      failure('request_timeout', 0, { uncertain: true }),
    );
    test.work.start();
    await vi.advanceTimersByTimeAsync(0);
    test.denied.add(operation);
    test.work.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(test.services.reprocess).toHaveBeenCalledTimes(1);
    expect(test.services.uploads.cancel).not.toHaveBeenCalled();
    expect(test.lease.refresh).not.toHaveBeenCalled();
    expect(test.lease.finish).toHaveBeenCalledExactlyOnceWith('blocked');
    test.work.dispose();
  },
);
