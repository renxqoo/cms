import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
it('keeps queued files and their intent when creation is unavailable and resumes only after readiness returns', async () => {
  const test = queueFixture();
  test.denied.add('assets.createUpload');
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.create).not.toHaveBeenCalled();
  const id = test.controller.store.getState().items[0]?.id;
  expect(test.controller.store.getState().items[0]?.stage).toBe('queued');
  test.denied.clear();
  test.controller.reconcile();
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.create).toHaveBeenCalledTimes(1);
  expect(test.controller.store.getState().items[0]?.id).toBe(id);
  test.controller.dispose();
});
it('does not pump a third queued file when two already accepted completions settle after write readiness is lost', async () => {
  const test = queueFixture();
  let created = 0;
  test.services.create.mockImplementation(() =>
    Promise.resolve(ok(session({ id: ++created === 1 ? first : second }))),
  );
  const accepted = deferred<ApiResult<UploadSession>>();
  test.services.complete.mockImplementation(({ uploadId }) =>
    uploadId === first ? accepted.promise : new Promise(() => {}),
  );
  test.controller.start();
  test.controller.add([file('one.png'), file('two.png'), file('three.png')]);
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.create).toHaveBeenCalledTimes(2);
  const queuedId = test.controller.store.getState().items[2]?.id;
  test.denied.add('assets.createUpload');
  accepted.finish(ok(session({ status: 'ready', manifest })));
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.create).toHaveBeenCalledTimes(2);
  expect(test.controller.store.getState().items[2]).toMatchObject({
    id: queuedId,
    stage: 'queued',
  });
  test.controller.dispose();
});
it('does not send completion after live permission is lost but preserves the original completion intent for explicit verification', async () => {
  const test = queueFixture();
  const bytes = deferred<ApiResult<{ uploadId: string; bytes: number; digest: string }>>();
  test.services.write.mockReturnValue(bytes.promise);
  test.services.read.mockResolvedValueOnce(ok(session({ status: 'uploading' })));
  test.controller.start();
  test.controller.add([file()]);
  await vi.advanceTimersByTimeAsync(0);
  test.denied.add('assets.completeUpload');
  bytes.finish(ok({ uploadId: first, bytes: 4, digest: 'digest' }));
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.complete).not.toHaveBeenCalled();
  expect(test.controller.store.getState().items[0]?.stage).toBe('blocked');
  test.denied.clear();
  test.controller.verify(test.controller.store.getState().items[0]?.id ?? '');
  await vi.advanceTimersByTimeAsync(0);
  expect(test.services.complete).toHaveBeenCalledTimes(1);
  expect(test.services.write).toHaveBeenCalledTimes(1);
  expect(test.services.create).toHaveBeenCalledTimes(1);
  test.controller.dispose();
});
