import { z } from 'zod';
import { requestApi } from '../../api/client';
import { uploadSessionSchema } from '../../contracts/assets';
import type { UploadSession } from '../../contracts/assets';
import {
  queuedItem,
  updateUpload,
  validTask,
  finishUpload,
  terminalStatus,
  reportUpload,
} from './upload-state';
import type { UploadTask } from './upload-state';
import { assetUiPolicy } from './policy';

const bytesReceiptSchema = z.object({
  uploadId: z.uuid(),
  bytes: z.number().int().positive(),
  digest: z.string(),
});

function observe(input: UploadTask, session: UploadSession) {
  if (!validTask(input)) return;
  const { runtime, id, task } = input;
  const terminal = terminalStatus(session.status);
  updateUpload(runtime, id, {
    session,
    status: terminal ?? 'processing',
    error: null,
    uncertainStep: null,
  });
  if (session.status === 'ready' && runtime.options.onProcessed) void saveProcessedUpload(input);
  else if (terminal) finishUpload(input);
  else if (session.status !== 'processing' || Date.now() >= task.deadline || !runtime.visible) {
    updateUpload(runtime, id, { status: 'paused' });
    finishUpload(input);
  } else
    task.timer = setTimeout(() => {
      void readUpload(input);
    }, pollInterval(task));
}

function pollInterval(task: UploadTask['task']) {
  const remaining = task.deadline - Date.now();
  return Math.min(
    remaining,
    remaining > assetUiPolicy.maximumWaitMs - assetUiPolicy.fastPollWindowMs
      ? assetUiPolicy.pollIntervalMs
      : assetUiPolicy.sustainedPollIntervalMs,
  );
}

export async function saveProcessedUpload(input: UploadTask) {
  const { runtime, id, task } = input;
  const current = queuedItem(runtime, id);
  const save = runtime.options.onProcessed;
  if (!current?.session || !save || !validTask(input)) return;
  updateUpload(runtime, id, { status: 'saving', uncertainStep: 'save', error: null });
  const result = await save(current.session, task.controller.signal);
  if (!reportUpload(input, result, 'save')) return;
  updateUpload(runtime, id, {
    status: 'consumed',
    session: { ...current.session, status: 'consumed' },
    uncertainStep: null,
    error: null,
  });
  finishUpload(input);
}

export async function readUpload(input: UploadTask) {
  const { runtime, id, task } = input;
  const current = queuedItem(runtime, id);
  if (!current?.session || !validTask(input)) return;
  const result = await requestApi({
    operation: 'assets.readUpload',
    params: { collection: runtime.options.collection, uploadId: current.session.id },
    response: uploadSessionSchema,
    signal: task.controller.signal,
  });
  if (reportUpload(input, result, null)) observe(input, result.data);
}

export async function completeUpload(input: UploadTask) {
  const { runtime, id, task } = input;
  const current = queuedItem(runtime, id);
  if (!current?.session || !validTask(input)) return;
  updateUpload(runtime, id, { status: 'processing', uncertainStep: 'complete' });
  const result = await requestApi({
    operation: 'assets.completeUpload',
    params: { collection: runtime.options.collection, uploadId: current.session.id },
    body: {},
    response: uploadSessionSchema,
    signal: task.controller.signal,
    idempotencyKey: current.completeKey,
  });
  if (reportUpload(input, result, 'complete')) observe(input, result.data);
}

export async function transferUpload(input: UploadTask) {
  const { runtime, id, task } = input;
  const current = queuedItem(runtime, id);
  const file = current?.file;
  if (!file || !current) return;
  const { options } = runtime;
  updateUpload(runtime, id, { status: 'uploading', error: null, uncertainStep: 'create' });
  const created = await requestApi({
    operation: 'assets.createUpload',
    params: { collection: options.collection },
    body: {
      purpose: options.purpose,
      filename: file.name,
      mimeType: file.type,
      bytes: file.size,
      ...(options.purpose === 'replace'
        ? { documentId: options.documentId, revision: options.revision }
        : {}),
    },
    response: uploadSessionSchema,
    signal: task.controller.signal,
    idempotencyKey: current.createKey,
  });
  if (!reportUpload(input, created, 'create')) return;
  updateUpload(runtime, id, { session: created.data, uncertainStep: 'bytes' });
  if (created.data.status !== 'pending') {
    observe(input, created.data);
    return;
  }
  const written = await requestApi({
    operation: 'assets.writeUpload',
    params: { collection: options.collection, uploadId: created.data.id },
    body: file,
    response: bytesReceiptSchema,
    signal: task.controller.signal,
    onUploadProgress: (progress) => {
      if (validTask(input))
        updateUpload(runtime, id, { progress: Math.min(100, (progress.loaded / file.size) * 100) });
    },
  });
  if (!reportUpload(input, written, 'bytes')) return;
  updateUpload(runtime, id, { progress: 100 });
  await completeUpload(input);
}
