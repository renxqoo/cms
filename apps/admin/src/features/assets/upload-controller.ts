import { createStore } from 'zustand/vanilla';
import { z } from 'zod';
import { requestApi } from '../../api/client';
import type { UploadSession } from '../../contracts/assets';
import { assetUiPolicy } from './policy';
import {
  queuedItem,
  updateUpload,
  stopUpload,
  validTask,
  finishUpload,
  terminalStatus,
  reportUpload,
} from './upload-state';
import type { QueuedUpload, UploadQueueOptions, UploadRuntime, UploadTask } from './upload-state';
import { readUpload, completeUpload, transferUpload } from './upload-transfer';

export type { QueuedUpload, UploadQueueOptions } from './upload-state';

function taskFor(runtime: UploadRuntime, id: string): UploadTask {
  const task = {
    controller: new AbortController(),
    deadline: Date.now() + assetUiPolicy.maximumWaitMs,
    timer: null,
  };
  runtime.running.set(id, task);
  return { runtime, id, task };
}
function pump(runtime: UploadRuntime) {
  if (runtime.disposed || !runtime.visible || runtime.blocked) return;
  for (const queued of runtime.store.getState().items) {
    if (runtime.running.size >= assetUiPolicy.concurrency) return;
    if (queued.status === 'queued') void transferUpload(taskFor(runtime, queued.id));
  }
}
function enqueue(runtime: UploadRuntime, files: readonly File[]) {
  if (runtime.disposed) return;
  const available = assetUiPolicy.queueSize - runtime.store.getState().items.length;
  const added = files.slice(0, Math.max(0, available)).map((file): QueuedUpload => ({
    id: crypto.randomUUID(),
    file,
    name: file.name,
    status: 'queued',
    progress: 0,
    session: null,
    error: null,
    uncertainStep: null,
    createKey: crypto.randomUUID(),
    completeKey: crypto.randomUUID(),
  }));
  runtime.store.setState((state) => ({ items: [...state.items, ...added] }));
  runtime.pump();
}
function verify(runtime: UploadRuntime, id: string) {
  const current = queuedItem(runtime, id);
  if (
    !current ||
    runtime.disposed ||
    !runtime.visible ||
    runtime.running.has(id) ||
    runtime.running.size >= assetUiPolicy.concurrency
  )
    return;
  if (runtime.blocked && Date.now() < runtime.retryAt) return;
  runtime.blocked = false;
  const input = taskFor(runtime, id);
  if (!current.session && current.uncertainStep === 'create') void transferUpload(input);
  else if (current.uncertainStep === 'complete') void completeUpload(input);
  else if (current.session) void readUpload(input);
  else finishUpload(input);
}
async function cancel(runtime: UploadRuntime, id: string) {
  const current = queuedItem(runtime, id);
  if (!current || runtime.disposed || ['consumed', 'cancelled', 'expired'].includes(current.status))
    return;
  stopUpload(runtime, id);
  if (!current.session) {
    updateUpload(runtime, id, {
      status: current.uncertainStep === 'create' ? 'paused' : 'cancelled',
    });
    runtime.pump();
    return;
  }
  const input = taskFor(runtime, id);
  const result = await requestApi({
    operation: 'assets.cancelUpload',
    params: { collection: runtime.options.collection, uploadId: current.session.id },
    response: z.undefined(),
    signal: input.task.controller.signal,
  });
  if (reportUpload(input, result, null) && validTask(input)) {
    updateUpload(runtime, id, { status: 'cancelled', error: null });
    finishUpload(input);
  }
}
function recover(runtime: UploadRuntime, session: UploadSession) {
  if (
    runtime.disposed ||
    session.collection !== runtime.options.collection ||
    queuedItem(runtime, session.id)
  )
    return;
  const status = terminalStatus(session.status) ?? 'paused';
  runtime.store.setState((state) => ({
    items: [
      ...state.items,
      {
        id: session.id,
        file: null,
        name: session.filename,
        session,
        status,
        progress: 0,
        error: null,
        uncertainStep: null,
        createKey: crypto.randomUUID(),
        completeKey: crypto.randomUUID(),
      },
    ],
  }));
  if (status === 'paused') verify(runtime, session.id);
}
function visibility(runtime: UploadRuntime, next: boolean) {
  runtime.visible = next;
  if (!next)
    for (const [id] of runtime.running) {
      updateUpload(runtime, id, { status: 'paused' });
      stopUpload(runtime, id);
    }
  else runtime.pump();
}

export function createUploadController(options: UploadQueueOptions) {
  const runtime: UploadRuntime = {
    options,
    store: createStore<{ items: readonly QueuedUpload[] }>(() => ({ items: [] })),
    running: new Map(),
    disposed: false,
    visible: true,
    blocked: false,
    retryAt: 0,
    pump: () => pump(runtime),
  };
  return {
    store: runtime.store,
    activate() {
      runtime.disposed = false;
    },
    enqueue: (files: readonly File[]) => enqueue(runtime, files),
    verify: (id: string) => verify(runtime, id),
    cancel: (id: string) => cancel(runtime, id),
    recover: (session: UploadSession) => recover(runtime, session),
    retry(id: string) {
      const current = queuedItem(runtime, id);
      if (current?.file && ['failed', 'cancelled', 'expired'].includes(current.status))
        enqueue(runtime, [current.file]);
    },
    markConsumed(id: string) {
      updateUpload(runtime, id, { status: 'consumed' });
    },
    setVisible: (next: boolean) => visibility(runtime, next),
    dispose() {
      runtime.disposed = true;
      for (const [id] of runtime.running) stopUpload(runtime, id);
    },
  };
}
