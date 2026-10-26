import { createStore } from 'zustand/vanilla';
import { failure } from '../../api/result';
import { browserVisibility } from '../jobs/visibility';
import { createUploadQueue } from './upload-queue';
import {
  assetWorkServices,
  authorizedAssetWorkServices,
  permitsAssetWork,
} from './document-work-services';
import {
  blockAssetWork,
  finishAssetWork,
  settleSession,
  rejectedAssetWork,
} from './document-work-results';
import { startReprocessing } from './document-reprocess';
import { cancelAssetWork, verifyAssetWork } from './document-work-actions';
import type {
  AssetWorkController,
  AssetWorkInput,
  AssetWorkRuntime,
  AssetWorkState,
} from './document-work-types';

function startAssetWork(runtime: AssetWorkRuntime) {
  if (runtime.finished || runtime.signal.aborted) return;
  runtime.disposed = false;
  if (runtime.input.lease.revision !== runtime.input.revision) {
    blockAssetWork(runtime, failure('version_conflict', 409));
    void finishAssetWork(runtime, 'failed');
    return;
  }
  if (runtime.input.kind === 'replace') {
    runtime.store.setState({ phase: 'uploading' });
    runtime.queue?.start();
    if (runtime.queue?.store.getState().items.length === 0) runtime.queue.add([runtime.input.file]);
  } else void startReprocessing(runtime);
}

function releaseWork(runtime: AssetWorkRuntime) {
  if (!runtime.finished && !runtime.blocked) {
    runtime.blocked = true;
    runtime.input.lease.finish('blocked');
  }
  runtime.disposed = true;
  runtime.controller.abort();
  runtime.poller?.dispose();
  runtime.stopPolling?.();
  runtime.queue?.dispose();
}

function replacementFailure(
  runtime: AssetWorkRuntime,
  result: Parameters<typeof blockAssetWork>[1],
) {
  const current = runtime.queue?.store.getState().items[0];
  if (!result.ok && !result.uncertain && current?.stage === 'preparing' && !current.session) {
    if (result.status !== 429) {
      rejectedAssetWork(runtime, result);
      return;
    }
    runtime.rejected = result;
  }
  blockAssetWork(runtime, result);
}

function replacementQueue(runtime: AssetWorkRuntime) {
  return createUploadQueue({
    collection: runtime.input.collection,
    budget: runtime.input.budget,
    purpose: 'replace',
    can: runtime.input.can,
    target: { id: runtime.input.documentId, revision: runtime.input.lease.revision },
    concurrency: 1,
    services: runtime.services.uploads,
    onResult: (result) => replacementFailure(runtime, result),
    onReady: (session) => {
      void settleSession(runtime, session);
    },
    onTerminal: (session) => {
      void settleSession(runtime, session);
    },
    visibility: browserVisibility,
  });
}

function abortAssetWork(runtime: AssetWorkRuntime) {
  if (!runtime.disposed && !runtime.finished) {
    runtime.queue?.dispose();
    runtime.poller?.dispose();
    blockAssetWork(runtime, failure('request_cancelled', 0, { uncertain: true }));
  }
}

export function createAssetDocumentWork(input: AssetWorkInput): AssetWorkController {
  const controller = new AbortController();
  const runtime: AssetWorkRuntime = {
    input,
    controller,
    signal: AbortSignal.any([controller.signal, input.lease.signal]),
    services: authorizedAssetWorkServices(input, input.services ?? assetWorkServices),
    store: createStore<AssetWorkState>(() => ({
      phase: 'idle',
      error: null,
      paused: null,
      retryAt: null,
      job: null,
    })),
    queue: null,
    poller: null,
    stopPolling: null,
    receipt: null,
    session: null,
    key: crypto.randomUUID(),
    active: false,
    disposed: false,
    finished: false,
    blocked: false,
    rejected: null,
  };
  if (input.kind === 'replace') runtime.queue = replacementQueue(runtime);
  const aborted = () => abortAssetWork(runtime);
  runtime.signal.addEventListener('abort', aborted, { once: true });
  return {
    store: runtime.store,
    queue: runtime.queue,
    start: () => startAssetWork(runtime),
    verify: () => {
      void verifyAssetWork(runtime);
    },
    cancel: () => {
      void cancelAssetWork(runtime);
    },
    canVerify: (can) => canVerify(runtime, can),
    canCancel: (can) => canCancel(runtime, can),
    dispose() {
      releaseWork(runtime);
      runtime.signal.removeEventListener('abort', aborted);
    },
  };
}

function canVerify(runtime: AssetWorkRuntime, can: AssetWorkInput['can']) {
  if (runtime.rejected) return true;
  if (runtime.input.kind === 'reprocess')
    return permitsAssetWork({ can }, runtime.receipt ? 'content.getJob' : 'assets.reprocess');
  const session = runtime.queue?.store.getState().items[0]?.session;
  return permitsAssetWork({ can }, session ? 'assets.readUpload' : 'assets.createUpload');
}
function canCancel(runtime: AssetWorkRuntime, can: AssetWorkInput['can']) {
  if (runtime.rejected) return true;
  if (!permitsAssetWork({ can }, 'assets.cancelUpload')) return false;
  if (runtime.input.kind === 'reprocess')
    return runtime.receipt !== null || permitsAssetWork({ can }, 'assets.reprocess');
  const session = runtime.queue?.store.getState().items[0]?.session;
  return (
    (session !== null && session !== undefined) || permitsAssetWork({ can }, 'assets.createUpload')
  );
}
