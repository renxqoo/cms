import { failure } from '../../api/result';
import type { UploadSession } from '../../contracts/assets';
import type { QueueUpload, UploadRuntime } from './upload-queue-types';
import { observeUpload, receivedSession, matchingSession } from './upload-session';
import { failedUpload, queueException, stopUpload, updateUpload, uploadItem } from './upload-state';
import { startUpload } from './upload-worker';

async function completeKnown(runtime: UploadRuntime, id: string, session: UploadSession) {
  const entry = runtime.entries.get(id);
  if (!entry?.request) return;
  const { signal } = entry.request;
  const result = await runtime.services.complete({
    collection: runtime.input.collection,
    uploadId: session.id,
    key: entry.completeKey,
    signal,
  });
  if (signal.aborted || runtime.disposed) return;
  if (!result.ok) {
    failedUpload(runtime, id, result);
    return;
  }
  receivedSession(runtime, id, result.data);
}

async function readCurrent(runtime: UploadRuntime, id: string) {
  const item = uploadItem(runtime, id);
  const entry = runtime.entries.get(id);
  if (!item?.session || !entry?.request) return;
  const { signal } = entry.request;
  const result = await runtime.services.read({
    collection: runtime.input.collection,
    uploadId: item.session.id,
    signal,
  });
  if (signal.aborted || runtime.disposed) return;
  if (!result.ok) {
    failedUpload(runtime, id, result);
    return;
  }
  if (result.data.id !== item.session.id || !matchingSession(runtime, result.data)) {
    failedUpload(runtime, id, failure('invalid_response', 502, { uncertain: true }));
    return;
  }
  if (['pending', 'uploading'].includes(result.data.status)) {
    if (!entry.bytesWritten) {
      updateUpload(runtime, id, { stage: 'blocked', session: result.data });
      return;
    }
    await completeKnown(runtime, id, result.data);
  } else receivedSession(runtime, id, result.data);
  if (uploadItem(runtime, id)?.stage === 'processing') observeUpload(runtime, id);
}

export async function verifyUpload(runtime: UploadRuntime, id: string) {
  const item = uploadItem(runtime, id);
  const entry = runtime.entries.get(id);
  if (!item || !entry || runtime.disposed || (item.retryAt ?? 0) > Date.now()) return;
  runtime.store.setState({ stopped: false });
  if (!item.session) {
    await startUpload(runtime, item);
    return;
  }
  if (entry.poller) {
    entry.poller.resume();
    return;
  }
  stopUpload(runtime, id);
  entry.request = new AbortController();
  try {
    await readCurrent(runtime, id);
  } catch {
    if (!entry.request?.signal.aborted) failedUpload(runtime, id, failure('request_failed', 0));
  }
}

async function sessionToCancel(
  runtime: UploadRuntime,
  item: QueueUpload,
  signal: AbortSignal,
): Promise<UploadSession | null> {
  if (item.session) return item.session;
  const entry = runtime.entries.get(item.id);
  if (!entry) return null;
  const result = await runtime.services.create({
    collection: runtime.input.collection,
    purpose: runtime.input.purpose,
    file: item.file,
    ...(runtime.input.target ? { target: runtime.input.target } : {}),
    key: entry.createKey,
    signal,
  });
  if (signal.aborted || runtime.disposed) return null;
  if (!result.ok) {
    failedUpload(runtime, item.id, result);
    return null;
  }
  return result.data;
}

async function cancelKnown(
  runtime: UploadRuntime,
  id: string,
  input: { session: UploadSession; signal: AbortSignal; confirmed?: () => void },
) {
  const { session, signal } = input;
  if (!matchingSession(runtime, session)) {
    failedUpload(runtime, id, failure('invalid_response', 502, { uncertain: true }));
    return;
  }
  updateUpload(runtime, id, { session, stage: 'blocked' });
  const cancelled = await runtime.services.cancel({
    collection: runtime.input.collection,
    uploadId: session.id,
    signal,
  });
  if (signal.aborted || runtime.disposed) return;
  if (!cancelled.ok) {
    failedUpload(runtime, id, cancelled);
    return;
  }
  const current = await runtime.services.read({
    collection: runtime.input.collection,
    uploadId: session.id,
    signal,
  });
  if (signal.aborted || runtime.disposed) return;
  if (!current.ok) {
    failedUpload(runtime, id, current);
    return;
  }
  if (
    current.data.id !== session.id ||
    !['failed', 'cancelled', 'expired'].includes(current.data.status)
  ) {
    failedUpload(runtime, id, failure('invalid_response', 502, { uncertain: true }));
    return;
  }
  receivedSession(runtime, id, current.data);
  input.confirmed?.();
}

export async function cancelUpload(runtime: UploadRuntime, id: string, confirmed?: () => void) {
  const item = uploadItem(runtime, id);
  const entry = runtime.entries.get(id);
  if (!item || !entry || runtime.disposed || (item.retryAt ?? 0) > Date.now()) return;
  stopUpload(runtime, id);
  if (item.stage === 'queued') {
    updateUpload(runtime, id, { stage: 'cancelled' });
    confirmed?.();
    return;
  }
  entry.request = new AbortController();
  const { signal } = entry.request;
  try {
    const session = await sessionToCancel(runtime, item, signal);
    if (session)
      await cancelKnown(runtime, id, { session, signal, ...(confirmed ? { confirmed } : {}) });
  } catch {
    if (!signal.aborted) failedUpload(runtime, id, queueException(signal));
  }
}
