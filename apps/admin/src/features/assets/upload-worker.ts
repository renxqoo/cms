import { permitsUpload } from './upload-permissions';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { UploadSession } from '../../contracts/assets';
import type { QueueUpload, UploadRuntime } from './upload-queue-types';
import { failedUpload, queueException, updateUpload, uploadItem } from './upload-state';
import { observeUpload, receivedSession, matchingSession } from './upload-session';

async function writeFile(runtime: UploadRuntime, item: QueueUpload, session: UploadSession) {
  const entry = runtime.entries.get(item.id);
  if (!entry?.request) return;
  const { signal } = entry.request;
  updateUpload(runtime, item.id, { stage: 'uploading', session });
  const result = await runtime.services.write({
    collection: runtime.input.collection,
    session,
    file: item.file,
    signal,
    onProgress: (progress) => updateUpload(runtime, item.id, { progress }),
  });
  if (signal.aborted || runtime.disposed) return;
  if (!result.ok) {
    failedUpload(runtime, item.id, result);
    return;
  }
  if (result.data.uploadId !== session.id || result.data.bytes !== item.file.size) {
    failedUpload(runtime, item.id, failure('invalid_response', 502, { uncertain: true }));
    return;
  }
  entry.bytesWritten = true;
  updateUpload(runtime, item.id, {
    stage: 'completing',
    progress: { loaded: result.data.bytes, total: item.file.size },
  });
  const complete = await runtime.services.complete({
    collection: runtime.input.collection,
    uploadId: session.id,
    key: entry.completeKey,
    signal,
  });
  if (signal.aborted || runtime.disposed) return;
  if (!complete.ok) {
    failedUpload(runtime, item.id, complete);
    return;
  }
  receivedSession(runtime, item.id, complete.data);
  if (uploadItem(runtime, item.id)?.stage === 'processing') observeUpload(runtime, item.id);
}

export async function startUpload(runtime: UploadRuntime, item: QueueUpload) {
  const entry = runtime.entries.get(item.id);
  if (!entry || runtime.disposed) return;
  entry.request?.abort();
  entry.request = new AbortController();
  const { signal } = entry.request;
  updateUpload(runtime, item.id, { stage: 'preparing', error: null, paused: null });
  let created: ApiResult<UploadSession>;
  try {
    created = await runtime.services.create({
      collection: runtime.input.collection,
      file: item.file,
      purpose: runtime.input.purpose,
      ...(runtime.input.target ? { target: runtime.input.target } : {}),
      key: entry.createKey,
      signal,
    });
    if (signal.aborted || runtime.disposed) return;
    if (!created.ok) {
      failedUpload(runtime, item.id, created);
      return;
    }
    if (!matchingSession(runtime, created.data)) {
      failedUpload(runtime, item.id, failure('invalid_response', 502, { uncertain: true }));
      return;
    }
    if (created.data.status !== 'pending') {
      receivedSession(runtime, item.id, created.data);
      if (uploadItem(runtime, item.id)?.stage === 'processing') observeUpload(runtime, item.id);
      return;
    }
    await writeFile(runtime, item, created.data);
  } catch {
    if (!signal.aborted) failedUpload(runtime, item.id, queueException(signal));
  }
}

export function pumpUploads(runtime: UploadRuntime) {
  if (
    runtime.disposed ||
    runtime.store.getState().stopped ||
    !permitsUpload(runtime.input.can, 'assets.createUpload')
  )
    return;
  const { items } = runtime.store.getState();
  const active = items.filter((item) =>
    ['preparing', 'uploading', 'completing', 'processing', 'blocked'].includes(item.stage),
  ).length;
  for (const nextItem of items
    .filter((item) => item.stage === 'queued')
    .slice(0, Math.max(0, runtime.input.concurrency - active)))
    void startUpload(runtime, nextItem);
}
