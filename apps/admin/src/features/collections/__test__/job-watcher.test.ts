import { afterEach, expect, it, vi } from 'vitest';
import { failure } from '../../../api/result';
import type { ApiResult } from '../../../api/result';
import { createJobWatcher } from '../job-watcher';
import type { JobWatchState } from '../job-watcher';
import { id, time, versionId } from './support';
const controls = vi.hoisted(() => ({
  request:
    vi.fn<(input: { operation: string; signal: AbortSignal }) => Promise<ApiResult<unknown>>>(),
}));
vi.mock('../../../api/client', () => ({ requestApi: controls.request }));
const watchers: ReturnType<typeof createJobWatcher>[] = [];
afterEach(() => {
  watchers.forEach((watcher) => watcher.dispose());
  watchers.length = 0;
  vi.resetAllMocks();
  vi.useRealTimers();
});
function job(status = 'queued') {
  return {
    kind: 'content',
    id: '60000000-0000-4000-8000-000000000001',
    collection: 'articles',
    action: 'batch',
    status,
    documentId: id,
    expectedRevision: 3,
    requestedVersionId: versionId,
    executeAt: time,
    createdAt: time,
    finishedAt: null,
    total: 1,
    succeeded: status === 'succeeded' ? 1 : 0,
    failed: 0,
    items: [{ position: 0, id, status: status === 'succeeded' ? 'succeeded' : 'queued' }],
  };
}
function ok(data: unknown): ApiResult<unknown> {
  return { ok: true, status: 200, requestId: '', data };
}
function setup() {
  const changed = vi.fn<(state: JobWatchState) => void>();
  const terminal = vi.fn<() => void>();
  const report = vi.fn<(result: ApiResult<unknown>) => void>();
  const watcher = createJobWatcher({
    collection: 'articles',
    jobId: '60000000-0000-4000-8000-000000000001',
    changed,
    terminal,
    report,
  });
  watchers.push(watcher);
  return { watcher, changed, terminal, report };
}
async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}
it('polls one persisted job at ten second intervals and stops when the real terminal result arrives', async () => {
  vi.useFakeTimers();
  controls.request
    .mockResolvedValueOnce(ok(job()))
    .mockResolvedValueOnce(ok(job('running')))
    .mockResolvedValueOnce(ok(job('succeeded')));
  const test = setup();
  test.watcher.start();
  await flush();
  await vi.advanceTimersByTimeAsync(9999);
  expect(controls.request).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(controls.request).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10000);
  expect(test.watcher.snapshot().data?.status).toBe('succeeded');
  expect(test.terminal).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});
it('stops automatic checks after a rate-limit error and does not retry on visibility restoration', async () => {
  vi.useFakeTimers();
  controls.request.mockResolvedValue({ ...failure('rate_limited', 429), retryAfterSeconds: 30 });
  const test = setup();
  test.watcher.start();
  await flush();
  test.watcher.visibility(false);
  test.watcher.visibility(true);
  await vi.advanceTimersByTimeAsync(60000);
  expect(controls.request).toHaveBeenCalledOnce();
  expect(test.watcher.snapshot().error?.retryAfterSeconds).toBe(30);
  controls.request.mockResolvedValue(ok(job('succeeded')));
  test.watcher.continue();
  await flush();
  expect(controls.request).toHaveBeenCalledTimes(2);
  expect(test.terminal).toHaveBeenCalledOnce();
});
it('pauses after five minutes without claiming cancellation and resumes only after explicit continuation', async () => {
  vi.useFakeTimers();
  controls.request.mockResolvedValue(ok(job()));
  const test = setup();
  test.watcher.start();
  await flush();
  await vi.advanceTimersByTimeAsync(300000);
  expect(test.watcher.snapshot().paused).toBe(true);
  expect(controls.request.mock.calls.every(([input]) => input.operation === 'content.getJob')).toBe(
    true,
  );
  const count = controls.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(60000);
  expect(controls.request).toHaveBeenCalledTimes(count);
  test.watcher.continue();
  await flush();
  expect(controls.request).toHaveBeenCalledTimes(count + 1);
});
it('aborts the local request when hidden and ignores its late result without cancelling remote work', async () => {
  vi.useFakeTimers();
  let resolve: ((result: ApiResult<unknown>) => void) | undefined;
  controls.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const test = setup();
  test.watcher.start();
  test.watcher.visibility(false);
  expect(controls.request.mock.calls[0]?.[0].signal.aborted).toBe(true);
  resolve?.(ok(job('succeeded')));
  await flush();
  expect(test.terminal).not.toHaveBeenCalled();
  expect(test.report).not.toHaveBeenCalled();
  expect(test.watcher.snapshot().data).toBeNull();
});
it('cleans the timer and abort signal on disposal, and survives the Strict Mode setup cleanup probe', async () => {
  vi.useFakeTimers();
  controls.request.mockResolvedValue(ok(job()));
  const test = setup();
  test.watcher.start();
  await flush();
  test.watcher.dispose();
  expect(vi.getTimerCount()).toBe(0);
  test.watcher.start();
  await flush();
  expect(controls.request).toHaveBeenCalledTimes(2);
  test.watcher.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('does not restart a timed-out job simply because the page becomes visible', async () => {
  vi.useFakeTimers();
  controls.request.mockResolvedValue(ok(job()));
  const test = setup();
  test.watcher.start();
  await flush();
  test.watcher.visibility(false);
  await vi.advanceTimersByTimeAsync(300001);
  test.watcher.visibility(true);
  expect(test.watcher.snapshot().paused).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
