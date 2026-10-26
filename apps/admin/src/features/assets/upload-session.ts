import { failure } from '../../api/result';
import type { UploadSession } from '../../contracts/assets';
import { createPolling } from '../jobs/polling';
import { assetWorkPolicy } from '../jobs/policy';
import type { UploadRuntime } from './upload-queue-types';
import { failedUpload, stopUpload, updateUpload, uploadItem } from './upload-state';

export function matchingSession(runtime: UploadRuntime, session: UploadSession) {
  const { target } = runtime.input;
  return (
    session.collection === runtime.input.collection &&
    session.purpose === runtime.input.purpose &&
    (!target || (session.documentId === target.id && session.revision === target.revision))
  );
}

export function receivedSession(runtime: UploadRuntime, id: string, session: UploadSession) {
  const item = uploadItem(runtime, id);
  if (!item || runtime.disposed) return;
  if (!matchingSession(runtime, session) || (item.session && item.session.id !== session.id)) {
    failedUpload(runtime, id, failure('invalid_response', 502, { uncertain: true }));
    return;
  }
  updateUpload(runtime, id, { session, error: null, paused: null, retryAt: null });
  if (session.status === 'ready' || session.status === 'consumed') {
    stopUpload(runtime, id);
    updateUpload(runtime, id, { stage: session.status });
    if (session.status === 'ready') runtime.input.onReady?.(session);
    else runtime.input.onTerminal?.(session);
  } else if (['failed', 'cancelled', 'expired'].includes(session.status)) {
    stopUpload(runtime, id);
    updateUpload(runtime, id, { stage: session.status === 'failed' ? 'failed' : 'cancelled' });
    runtime.input.onTerminal?.(session);
  } else updateUpload(runtime, id, { stage: 'processing' });
}

export function observeUpload(runtime: UploadRuntime, id: string) {
  const item = uploadItem(runtime, id);
  const entry = runtime.entries.get(id);
  if (!item?.session || !entry || runtime.disposed) return;
  stopUpload(runtime, id);
  const uploadId = item.session.id;
  const poller = createPolling({
    read: (signal) =>
      runtime.services.read({ collection: runtime.input.collection, uploadId, signal }),
    terminal: (session) => !['pending', 'uploading', 'processing'].includes(session.status),
    onResult: (result) => {
      if (!result.ok) failedUpload(runtime, id, result);
    },
    visibility: runtime.input.visibility,
    intervalMs: assetWorkPolicy.uploadPollMs,
    budgetMs: assetWorkPolicy.automaticWaitMs,
  });
  entry.poller = poller;
  entry.unsubscribe = poller.store.subscribe((state) => {
    if (state.phase === 'ready' && state.data) receivedSession(runtime, id, state.data);
    if (state.paused) updateUpload(runtime, id, { paused: state.paused, retryAt: state.retryAt });
  });
  poller.start();
}
