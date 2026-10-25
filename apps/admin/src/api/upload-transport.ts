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

function replyHeaders(raw: string) {
  const headers = new Headers();
  for (const line of raw.split(/[\r\n]+/)) {
    const colon = line.indexOf(':');
    if (colon > 0) headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
  }
  return headers;
}

export function uploadBytes(input: ByteUpload): Promise<Response> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    function cleanup() {
      input.signal.removeEventListener('abort', cancel);
      xhr.removeEventListener('load', loaded);
      xhr.removeEventListener('error', failed);
      xhr.removeEventListener('abort', failed);
      xhr.removeEventListener('timeout', failed);
      xhr.removeEventListener('progress', received);
      xhr.removeEventListener('readystatechange', headersReceived);
      xhr.upload.removeEventListener('progress', progress);
    }
    function settle(error?: Error, response?: Response) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else if (response) resolve(response);
    }
    function rejectAndAbort(error: Error) {
      settle(error);
      xhr.abort();
    }
    function cancel() {
      rejectAndAbort(new DOMException('Cancelled', 'AbortError'));
    }
    function failed() {
      settle(new Error('Upload request failed'));
    }
    function progress(event: ProgressEvent) {
      if (!settled)
        input.onProgress({ loaded: event.loaded, total: event.lengthComputable ? event.total : null });
    }
    function received(event: ProgressEvent) {
      if (event.loaded > requestPolicy.jsonResponseBytes)
        rejectAndAbort(new Error('Invalid response size'));
    }
    function headersReceived() {
      if (xhr.readyState !== XMLHttpRequest.HEADERS_RECEIVED) return;
      const length = xhr.getResponseHeader('content-length');
      if (length !== null && (!/^\d+$/.test(length) || Number(length) > requestPolicy.jsonResponseBytes))
        rejectAndAbort(new Error('Invalid response size'));
    }
    function loaded() {
      try {
        const body: unknown = xhr.response;
        if (!(body instanceof ArrayBuffer) || body.byteLength > requestPolicy.jsonResponseBytes || xhr.status === 0)
          throw new Error('Invalid response');
        if (xhr.responseURL && new URL(xhr.responseURL).href !== new URL(input.url, window.location.href).href)
          throw new Error('Unexpected response location');
        settle(undefined, new Response(xhr.status === 204 ? null : body, {
          status: xhr.status,
          headers: replyHeaders(xhr.getAllResponseHeaders()),
        }));
      } catch {
        settle(new Error('Invalid response'));
      }
    }
    try {
      if (input.signal.aborted) return cancel();
      xhr.open(input.method, input.url);
      xhr.responseType = 'arraybuffer';
      for (const [key, value] of input.headers) xhr.setRequestHeader(key, value);
      input.signal.addEventListener('abort', cancel, { once: true });
      xhr.addEventListener('load', loaded);
      xhr.addEventListener('error', failed);
      xhr.addEventListener('abort', failed);
      xhr.addEventListener('timeout', failed);
      xhr.addEventListener('progress', received);
      xhr.addEventListener('readystatechange', headersReceived);
      xhr.upload.addEventListener('progress', progress);
      xhr.send(input.body);
    } catch {
      settle(new Error('Upload request failed'));
    }
  });
}
