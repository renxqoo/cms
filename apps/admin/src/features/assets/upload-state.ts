import type { StoreApi } from 'zustand/vanilla';
import type { ApiResult } from '../../api/result';
import type { UploadSession } from '../../contracts/assets';
import type { ApiFailure } from '../management-shared/read-all-pages';

export interface QueuedUpload {
  id: string;
  file: File | null;
  name: string;
  status:
    | 'queued'
    | 'uploading'
    | 'processing'
    | 'ready'
    | 'consumed'
    | 'failed'
    | 'cancelled'
    | 'expired'
    | 'paused';
  progress: number;
  session: UploadSession | null;
  error: ApiFailure | null;
  uncertainStep: 'create' | 'bytes' | 'complete' | null;
  createKey: string;
  completeKey: string;
}
export interface UploadQueueOptions {
  collection: string;
  purpose: 'create' | 'replace';
  documentId?: string;
  revision?: number;
  onResult: (result: ApiResult<unknown>) => void;
}
export interface RunningUpload {
  controller: AbortController;
  deadline: number;
  timer: ReturnType<typeof setTimeout> | null;
}
export interface UploadRuntime {
  store: StoreApi<{ items: readonly QueuedUpload[] }>;
  running: Map<string, RunningUpload>;
  options: UploadQueueOptions;
  disposed: boolean;
  visible: boolean;
  blocked: boolean;
  retryAt: number;
  pump: () => void;
}
export interface UploadTask {
  runtime: UploadRuntime;
  id: string;
  task: RunningUpload;
}

export function queuedItem(runtime: UploadRuntime, id: string) {
  return runtime.store.getState().items.find((value) => value.id === id);
}
export function updateUpload(runtime: UploadRuntime, id: string, patch: Partial<QueuedUpload>) {
  if (!runtime.disposed)
    runtime.store.setState((state) => ({
      items: state.items.map((value) => (value.id === id ? { ...value, ...patch } : value)),
    }));
}
export function stopUpload(runtime: UploadRuntime, id: string) {
  const task = runtime.running.get(id);
  if (task) {
    clearTimeout(task.timer ?? undefined);
    task.controller.abort();
    runtime.running.delete(id);
  }
}
export function validTask({ runtime, id, task }: UploadTask) {
  return !runtime.disposed && runtime.running.get(id) === task && !task.controller.signal.aborted;
}
export function finishUpload({ runtime, id }: UploadTask) {
  stopUpload(runtime, id);
  runtime.pump();
}

export function terminalStatus(status: UploadSession['status']) {
  switch (status) {
    case 'ready':
    case 'consumed':
    case 'failed':
    case 'cancelled':
    case 'expired':
      return status;
    case 'pending':
    case 'uploading':
    case 'processing':
      return null;
  }
  return null;
}

export function reportUpload<T>(
  input: UploadTask,
  result: ApiResult<T>,
  step: QueuedUpload['uncertainStep'],
): result is Extract<ApiResult<T>, { ok: true }> {
  if (!validTask(input)) return false;
  if (result.ok) return true;
  input.runtime.options.onResult(result);
  if (result.status === 429) blockQueue(input, result.retryAfterSeconds);
  updateUpload(input.runtime, input.id, {
    status: step === null || result.uncertain || result.status === 429 ? 'paused' : 'failed',
    error: result,
    uncertainStep: result.uncertain || result.status === 429 ? step : null,
  });
  finishUpload(input);
  return false;
}

function blockQueue(input: UploadTask, retryAfterSeconds: number | null) {
  const { runtime } = input;
  runtime.blocked = true;
  runtime.retryAt = Date.now() + (retryAfterSeconds ?? 0) * 1000;
  for (const [id] of runtime.running) {
    if (id !== input.id) {
      updateUpload(runtime, id, { status: 'paused' });
      stopUpload(runtime, id);
    }
  }
}
