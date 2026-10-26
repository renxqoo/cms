import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { QueueUpload, UploadRuntime } from './upload-queue-types';

export function uploadItem(runtime: UploadRuntime, id: string) {
  return runtime.store.getState().items.find((item) => item.id === id);
}
export function updateUpload(runtime: UploadRuntime, id: string, changes: Partial<QueueUpload>) {
  if (!runtime.disposed)
    runtime.store.setState((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, ...changes } : item)),
    }));
}
export function failedUpload(runtime: UploadRuntime, id: string, result: ApiResult<unknown>) {
  if (result.ok || runtime.disposed) return;
  runtime.input.onResult(result);
  stopUpload(runtime, id);
  runtime.store.setState({ stopped: true });
  updateUpload(runtime, id, {
    stage: result.uncertain || result.status === 429 ? 'blocked' : 'failed',
    error: result,
    retryAt:
      result.retryAfterSeconds === null ? null : Date.now() + result.retryAfterSeconds * 1000,
  });
}
export function stopUpload(runtime: UploadRuntime, id: string) {
  const entry = runtime.entries.get(id);
  entry?.request?.abort();
  entry?.poller?.dispose();
  entry?.unsubscribe?.();
  if (entry) {
    entry.request = null;
    entry.poller = null;
    entry.unsubscribe = null;
  }
}
export function queueException(signal: AbortSignal) {
  return failure(signal.aborted ? 'request_cancelled' : 'request_failed', 0, { uncertain: true });
}
