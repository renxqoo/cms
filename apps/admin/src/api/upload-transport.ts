import { requestPolicy } from './config';

export interface UploadProgress {
  loaded: number;
  total: number | null;
}

interface ByteUpload {
  url: string;
  method: string;
  headers: Headers;
  body: Blob | ArrayBuffer;
  signal: AbortSignal;
  onProgress: (progress: UploadProgress) => void;
}

type Completion = { error: Error } | { response: Response };

interface UploadListeners {
  load: () => void;
  failed: () => void;
  cancel: () => void;
  received: (event: ProgressEvent) => void;
  progress: (event: ProgressEvent) => void;
  headers: () => void;
}

interface UploadRuntime {
  xhr: XMLHttpRequest;
  input: ByteUpload;
  settled: boolean;
  listeners: UploadListeners;
  complete: (result: Completion) => void;
}

function replyHeaders(raw: string) {
  const headers = new Headers();
  for (const line of raw.split(/[\r\n]+/)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

function cleanup({ xhr, input, listeners }: UploadRuntime) {
  input.signal.removeEventListener('abort', listeners.cancel);
  xhr.removeEventListener('load', listeners.load);
  xhr.removeEventListener('error', listeners.failed);
  xhr.removeEventListener('abort', listeners.failed);
  xhr.removeEventListener('timeout', listeners.failed);
  xhr.removeEventListener('progress', listeners.received);
  xhr.removeEventListener('readystatechange', listeners.headers);
  xhr.upload.removeEventListener('progress', listeners.progress);
}

function finish(runtime: UploadRuntime, result: Completion) {
  if (runtime.settled) return;
  runtime.settled = true;
  cleanup(runtime);
  runtime.complete(result);
}

function abortUpload(runtime: UploadRuntime, error: Error) {
  finish(runtime, { error });
  runtime.xhr.abort();
}

function loaded(runtime: UploadRuntime) {
  const { xhr, input } = runtime;
  try {
    const body: unknown = xhr.response;
    if (
      !(body instanceof ArrayBuffer) ||
      body.byteLength > requestPolicy.jsonResponseBytes ||
      xhr.status === 0
    )
      throw new Error('Invalid response');
    if (
      xhr.responseURL &&
      new URL(xhr.responseURL).href !== new URL(input.url, window.location.href).href
    )
      throw new Error('Unexpected response location');
    finish(runtime, {
      response: new Response(xhr.status === 204 ? null : body, {
        status: xhr.status,
        headers: replyHeaders(xhr.getAllResponseHeaders()),
      }),
    });
  } catch {
    finish(runtime, { error: new Error('Invalid response') });
  }
}

function receivedHeaders(runtime: UploadRuntime) {
  if (runtime.xhr.readyState !== XMLHttpRequest.HEADERS_RECEIVED) return;
  const length = runtime.xhr.getResponseHeader('content-length');
  if (
    length !== null &&
    (!/^\d+$/.test(length) || Number(length) > requestPolicy.jsonResponseBytes)
  )
    abortUpload(runtime, new Error('Invalid response size'));
}

function createRuntime(input: ByteUpload, complete: (result: Completion) => void): UploadRuntime {
  const listeners: UploadListeners = {
    load: () => loaded(runtime),
    failed: () => finish(runtime, { error: new Error('Upload request failed') }),
    cancel: () => abortUpload(runtime, new DOMException('Cancelled', 'AbortError')),
    headers: () => receivedHeaders(runtime),
    received: (event) => {
      if (event.loaded > requestPolicy.jsonResponseBytes)
        abortUpload(runtime, new Error('Invalid response size'));
    },
    progress: (event) => {
      if (!runtime.settled)
        input.onProgress({
          loaded: event.loaded,
          total: event.lengthComputable ? event.total : null,
        });
    },
  };
  const runtime: UploadRuntime = {
    xhr: new XMLHttpRequest(),
    input,
    settled: false,
    listeners,
    complete,
  };
  return runtime;
}

function observe({ xhr, input, listeners }: UploadRuntime) {
  input.signal.addEventListener('abort', listeners.cancel, { once: true });
  xhr.addEventListener('load', listeners.load);
  xhr.addEventListener('error', listeners.failed);
  xhr.addEventListener('abort', listeners.failed);
  xhr.addEventListener('timeout', listeners.failed);
  xhr.addEventListener('progress', listeners.received);
  xhr.addEventListener('readystatechange', listeners.headers);
  xhr.upload.addEventListener('progress', listeners.progress);
}

function sendUpload(input: ByteUpload, complete: (result: Completion) => void) {
  const runtime = createRuntime(input, complete);
  try {
    if (input.signal.aborted) {
      runtime.listeners.cancel();
      return;
    }
    const { xhr } = runtime;
    xhr.open(input.method, input.url);
    xhr.responseType = 'arraybuffer';
    for (const [key, value] of input.headers) xhr.setRequestHeader(key, value);
    observe(runtime);
    xhr.send(input.body);
  } catch {
    finish(runtime, { error: new Error('Upload request failed') });
  }
}

export function uploadBytes(input: ByteUpload): Promise<Response> {
  return new Promise((resolve, reject) => {
    sendUpload(input, (result) => {
      if ('error' in result) reject(result.error);
      else resolve(result.response);
    });
  });
}
