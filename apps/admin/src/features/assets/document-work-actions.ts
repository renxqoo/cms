import { permitsAssetWork } from './document-work-services';
import { failure } from '../../api/result';
import type { AssetWorkRuntime } from './document-work-types';
import {
  blockAssetWork,
  finishAssetWork,
  sessionMatchesWork,
  settleSession,
} from './document-work-results';
import { observeReprocessing, startReprocessing } from './document-reprocess';

export async function verifyAssetWork(runtime: AssetWorkRuntime) {
  if (
    runtime.disposed ||
    runtime.finished ||
    runtime.active ||
    (runtime.store.getState().retryAt ?? 0) > Date.now()
  )
    return;
  if (runtime.rejected) {
    await finishAssetWork(runtime, 'failed');
    return;
  }
  if (runtime.input.kind === 'reprocess') {
    if (!runtime.receipt) await startReprocessing(runtime);
    else observeReprocessing(runtime);
    return;
  }
  await verifyReplacement(runtime);
}

async function verifyReplacement(runtime: AssetWorkRuntime) {
  const queued = runtime.queue?.store.getState().items[0];
  if (!queued) return;
  if (!queued.session || ['pending', 'uploading', 'processing'].includes(queued.session.status)) {
    runtime.queue?.verify(queued.id);
    return;
  }
  runtime.active = true;
  try {
    const result = await runtime.services.uploads.read({
      collection: runtime.input.collection,
      uploadId: queued.session.id,
      signal: runtime.signal,
    });
    runtime.active = false;
    if (runtime.disposed || runtime.signal.aborted) return;
    if (!result.ok) {
      blockAssetWork(runtime, result);
      return;
    }
    if (result.data.id !== queued.session.id || !sessionMatchesWork(runtime, result.data)) {
      blockAssetWork(runtime, failure('invalid_response', 502, { uncertain: true }));
      return;
    }
    await settleSession(runtime, result.data);
  } catch {
    runtime.active = false;
    blockAssetWork(runtime, failure('request_failed', 0));
  }
}

async function cancelProcessing(runtime: AssetWorkRuntime) {
  if (!runtime.receipt) {
    await startReprocessing(runtime);
    if (!runtime.receipt) return;
  }
  runtime.poller?.dispose();
  runtime.active = true;
  try {
    const { uploadId } = runtime.receipt;
    const result = await runtime.services.uploads.cancel({
      collection: runtime.input.collection,
      uploadId,
      signal: runtime.signal,
    });
    if (runtime.disposed || runtime.signal.aborted) return;
    if (!result.ok) {
      blockAssetWork(runtime, result);
      return;
    }
    const current = await runtime.services.uploads.read({
      collection: runtime.input.collection,
      uploadId,
      signal: runtime.signal,
    });
    if (runtime.disposed || runtime.signal.aborted) return;
    if (!current.ok) {
      blockAssetWork(runtime, current);
      return;
    }
    if (
      current.data.id !== uploadId ||
      !sessionMatchesWork(runtime, current.data) ||
      !['cancelled', 'expired', 'failed'].includes(current.data.status)
    ) {
      blockAssetWork(runtime, failure('invalid_response', 502, { uncertain: true }));
      return;
    }
  } finally {
    runtime.active = false;
  }
  await finishAssetWork(runtime, 'cancelled');
}

export async function cancelAssetWork(runtime: AssetWorkRuntime) {
  if (
    runtime.disposed ||
    runtime.finished ||
    runtime.active ||
    (runtime.store.getState().retryAt ?? 0) > Date.now()
  )
    return;
  if (runtime.rejected) {
    await finishAssetWork(runtime, 'failed');
    return;
  }
  if (!permitsAssetWork(runtime.input, 'assets.cancelUpload')) {
    blockAssetWork(runtime, failure('forbidden', 403, { uncertain: true }));
    return;
  }
  if (runtime.input.kind === 'replace') {
    const first = runtime.queue?.store.getState().items[0];
    if (first) runtime.queue?.cancel(first.id);
    return;
  }
  try {
    await cancelProcessing(runtime);
  } catch {
    runtime.active = false;
    blockAssetWork(runtime, failure('request_failed', 0, { uncertain: true }));
  }
}
