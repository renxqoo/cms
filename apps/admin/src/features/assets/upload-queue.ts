import { createStore } from 'zustand/vanilla';
import { failure } from '../../api/result';
import { assetWorkPolicy } from '../jobs/policy';
import { authorizedUploadServices } from './upload-permissions';
import { uploadServices } from './upload-requests';
import { cancelUpload, verifyUpload } from './upload-actions';
import { stopUpload, uploadItem, updateUpload } from './upload-state';
import { observeUpload } from './upload-session';
import { pumpUploads, startUpload } from './upload-worker';
import type {
  QueueUpload,
  UploadQueueController,
  UploadQueueInput,
  UploadQueueState,
  UploadRuntime,
} from './upload-queue-types';

function addUploads(runtime: UploadRuntime, files: readonly File[]) {
  const available = Math.max(
    0,
    assetWorkPolicy.uploadQueueLimit - runtime.store.getState().items.length,
  );
  const added = files.slice(0, available).map<QueueUpload>((file) => {
    const id = crypto.randomUUID();
    runtime.entries.set(id, {
      createKey: crypto.randomUUID(),
      completeKey: crypto.randomUUID(),
      bytesWritten: false,
      request: null,
      poller: null,
      unsubscribe: null,
    });
    const invalid =
      file.size <= 0 ||
      file.size > runtime.input.budget.maxBytes ||
      !runtime.input.budget.mimeTypes.includes(file.type);
    return {
      id,
      file,
      stage: invalid ? 'failed' : 'queued',
      progress: { loaded: 0, total: null },
      session: null,
      error: invalid ? failure('invalid_input', 400) : null,
      paused: null,
      retryAt: null,
    };
  });
  runtime.store.setState((state) => ({ items: [...state.items, ...added] }));
}

function removeUpload(runtime: UploadRuntime, id: string) {
  const item = uploadItem(runtime, id);
  if (!item || !['queued', 'failed', 'cancelled', 'consumed'].includes(item.stage)) return;
  stopUpload(runtime, id);
  runtime.entries.delete(id);
  runtime.store.setState((state) => ({ items: state.items.filter((entry) => entry.id !== id) }));
}

function retryUpload(runtime: UploadRuntime, id: string) {
  const item = uploadItem(runtime, id);
  if (!item || !['failed', 'cancelled'].includes(item.stage)) return;
  const { file } = item;
  function fresh() {
    removeUpload(runtime, id);
    runtime.store.setState({ stopped: false });
    addUploads(runtime, [file]);
  }
  if (item.session && !['failed', 'cancelled', 'expired'].includes(item.session.status))
    void cancelUpload(runtime, id, fresh);
  else fresh();
}

function scheduleUploads(runtime: UploadRuntime) {
  if (runtime.disposed || runtime.pumping) return;
  runtime.pumping = true;
  queueMicrotask(() => {
    runtime.pumping = false;
    pumpUploads(runtime);
  });
}

function startQueue(runtime: UploadRuntime) {
  runtime.disposed = false;
  for (const item of runtime.store.getState().items) {
    if (item.stage === 'preparing') void startUpload(runtime, item);
    else if (item.stage === 'processing') observeUpload(runtime, item.id);
    else if (item.stage === 'uploading' || item.stage === 'completing') {
      updateUpload(runtime, item.id, {
        stage: 'blocked',
        error: failure('request_cancelled', 0, { uncertain: true }),
      });
      runtime.store.setState({ stopped: true });
    }
  }
  scheduleUploads(runtime);
}

export function createUploadQueue(input: UploadQueueInput): UploadQueueController {
  const runtime: UploadRuntime = {
    input,
    services: authorizedUploadServices(input.services ?? uploadServices, input.can),
    store: createStore<UploadQueueState>(() => ({ items: [], stopped: false })),
    entries: new Map(),
    disposed: true,
    pumping: false,
  };
  let unsubscribe: (() => void) | null = null;
  return {
    store: runtime.store,
    start() {
      unsubscribe ??= runtime.store.subscribe(() => scheduleUploads(runtime));
      startQueue(runtime);
    },
    reconcile: () => scheduleUploads(runtime),
    add: (files) => addUploads(runtime, files),
    retry: (id) => retryUpload(runtime, id),
    verify: (id) => {
      void verifyUpload(runtime, id);
    },
    cancel: (id) => {
      void cancelUpload(runtime, id);
    },
    remove: (id) => removeUpload(runtime, id),
    dispose() {
      runtime.disposed = true;
      for (const id of runtime.entries.keys()) stopUpload(runtime, id);
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
