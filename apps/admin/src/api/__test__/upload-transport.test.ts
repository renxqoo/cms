import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requestApi } from '../client';
import { uploadBytes } from '../upload-transport';
import type { UploadProgress } from '../upload-transport';
import { TrackedTarget } from './xhr-support';

class TestXhr extends TrackedTarget {
  static HEADERS_RECEIVED = 2;
  static instances: TestXhr[] = [];
  static failAt: 'open' | 'send' | null = null;
  upload = new TrackedTarget();
  responseType = '';
  status = 200;
  response: unknown = new TextEncoder().encode('{"accepted":true}').buffer;
  responseURL = '';
  readyState = 0;
  headers = new Map<string, string>();
  responseHeaders = new Map<string, string>([['content-type', 'application/json']]);
  body: unknown;
  url = '';
  method = '';
  abort = vi.fn<() => void>(() => {
    this.dispatchEvent(new Event('abort'));
  });
  constructor() {
    super();
    TestXhr.instances.push(this);
  }
  open(method: string, url: string) {
    if (TestXhr.failAt === 'open') throw new Error('Open failed');
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers.set(name, value);
  }
  getResponseHeader(name: string) {
    return this.responseHeaders.get(name) ?? null;
  }
  getAllResponseHeaders() {
    return [...this.responseHeaders].map(([name, value]) => `${name}: ${value}`).join('\r\n');
  }
  send(body: unknown) {
    if (TestXhr.failAt === 'send') throw new Error('Send failed');
    this.body = body;
  }
}

function activeXhr() {
  const xhr = TestXhr.instances.at(-1);
  if (!xhr) throw new Error('Expected a byte request');
  return xhr;
}

function progress(loaded: number, total: number, lengthComputable = true) {
  return Object.assign(new Event('progress'), { loaded, total, lengthComputable });
}

function start(
  signal = new AbortController().signal,
  onProgress = vi.fn<(value: UploadProgress) => void>(),
) {
  return requestApi({
    operation: 'assets.writeUpload',
    params: { collection: 'media', uploadId: 'upload' },
    body: new Blob([new Uint8Array([0, 128, 255])]),
    response: z.object({ accepted: z.literal(true) }),
    signal,
    onUploadProgress: onProgress,
  });
}

beforeEach(() => {
  TestXhr.instances = [];
  TestXhr.failAt = null;
  vi.stubGlobal('XMLHttpRequest', TestXhr);
  vi.stubGlobal('window', { location: { href: 'https://admin.example/dashboard' } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('native byte upload lifecycle', () => {
  it('reports only real byte progress and releases every listener after validated JSON', async () => {
    const onProgress = vi.fn<(value: UploadProgress) => void>();
    const pending = start(undefined, onProgress);
    const xhr = activeXhr();
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('/api/cms/v1/collections/media/uploads/upload/content');
    expect(xhr.headers.get('content-type')).toBe('application/octet-stream');
    expect(xhr.headers.has('authorization')).toBe(false);
    expect(xhr.body).toBeInstanceOf(Blob);
    expect(onProgress).not.toHaveBeenCalled();
    xhr.upload.dispatchEvent(progress(2, 3));
    xhr.upload.dispatchEvent(progress(3, 0, false));
    expect(onProgress.mock.calls).toEqual([
      [{ loaded: 2, total: 3 }],
      [{ loaded: 3, total: null }],
    ]);
    xhr.dispatchEvent(new Event('load'));
    expect(await pending).toMatchObject({ ok: true, data: { accepted: true } });
    expect(xhr.listenerCount + xhr.upload.listenerCount).toBe(0);
    xhr.upload.dispatchEvent(progress(10, 10));
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('preserves a confirmed server error and Retry-After', async () => {
    const pending = start();
    const xhr = activeXhr();
    xhr.status = 429;
    xhr.responseHeaders.set('retry-after', '17');
    xhr.response = new TextEncoder().encode(
      JSON.stringify({
        error: { code: 'rate_limited', message: 'Wait.', requestId: 'upload-request' },
      }),
    ).buffer;
    xhr.dispatchEvent(new Event('load'));
    expect(await pending).toMatchObject({
      ok: false,
      status: 429,
      retryAfterSeconds: 17,
      uncertain: false,
      error: { code: 'rate_limited' },
    });
  });

  it('handles a real empty 204 response without parsing JSON', async () => {
    const pending = uploadBytes({
      url: '/upload',
      method: 'PUT',
      headers: new Headers(),
      body: new ArrayBuffer(0),
      signal: new AbortController().signal,
      onProgress: vi.fn<(value: UploadProgress) => void>(),
    });
    const xhr = activeXhr();
    xhr.status = 204;
    xhr.response = new ArrayBuffer(0);
    xhr.dispatchEvent(new Event('load'));
    const response = await pending;
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
  });

  it('cancels the native request and marks the dispatched write uncertain', async () => {
    const controller = new AbortController();
    const pending = start(controller.signal);
    const xhr = activeXhr();
    controller.abort();
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'request_cancelled' },
      uncertain: true,
    });
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(xhr.listenerCount + xhr.upload.listenerCount).toBe(0);
  });

  it('does not create a native request for an already cancelled intent', async () => {
    const controller = new AbortController();
    controller.abort();
    expect(await start(controller.signal)).toMatchObject({
      ok: false,
      uncertain: false,
      error: { code: 'request_cancelled' },
    });
    expect(TestXhr.instances).toHaveLength(0);
  });

  it('times out once and removes its timer and native listeners', async () => {
    vi.useFakeTimers();
    const pending = start();
    const xhr = activeXhr();
    await vi.advanceTimersByTimeAsync(90000);
    expect(await pending).toMatchObject({
      ok: false,
      error: { code: 'request_timeout' },
      uncertain: true,
    });
    expect(xhr.abort).toHaveBeenCalledOnce();
    expect(xhr.listenerCount + xhr.upload.listenerCount).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['error', 'abort', 'timeout'])(
    'treats a native %s after dispatch as uncertain without retrying',
    async (type) => {
      const pending = start();
      activeXhr().dispatchEvent(new Event(type));
      expect(await pending).toMatchObject({
        ok: false,
        uncertain: true,
        error: { code: 'request_failed' },
      });
      expect(TestXhr.instances).toHaveLength(1);
      expect(activeXhr().listenerCount + activeXhr().upload.listenerCount).toBe(0);
    },
  );

  it.each(['declared', 'progress', 'actual'])(
    'aborts an oversized %s response and cleans up',
    async (kind) => {
      const pending = start();
      const xhr = activeXhr();
      if (kind === 'declared') {
        xhr.readyState = 2;
        xhr.responseHeaders.set('content-length', '2097153');
        xhr.dispatchEvent(new Event('readystatechange'));
      } else if (kind === 'progress') xhr.dispatchEvent(progress(2097153, 2097153));
      else {
        xhr.response = new ArrayBuffer(2097153);
        xhr.dispatchEvent(new Event('load'));
      }
      expect(await pending).toMatchObject({ ok: false, uncertain: true });
      expect(xhr.listenerCount + xhr.upload.listenerCount).toBe(0);
      expect(xhr.abort).toHaveBeenCalledTimes(kind === 'actual' ? 0 : 1);
    },
  );

  it.each(['redirect', 'status', 'body'])(
    'rejects an invalid %s response without fake success',
    async (kind) => {
      const pending = start();
      const xhr = activeXhr();
      if (kind === 'redirect') xhr.responseURL = 'https://other.example/upload';
      if (kind === 'status') xhr.status = 0;
      if (kind === 'body') xhr.response = 'not raw response bytes';
      xhr.dispatchEvent(new Event('load'));
      expect(await pending).toMatchObject({ ok: false, uncertain: true });
      expect(xhr.listenerCount + xhr.upload.listenerCount).toBe(0);
    },
  );

  it.each(['open', 'send'] as const)('cleans up when the native %s throws', async (stage) => {
    TestXhr.failAt = stage;
    expect(await start()).toMatchObject({ ok: false, uncertain: true });
    expect(activeXhr().listenerCount + activeXhr().upload.listenerCount).toBe(0);
  });

  it('rejects a progress observer for JSON requests before dispatch', async () => {
    expect(
      await requestApi({
        operation: 'identity.login',
        body: {},
        response: z.unknown(),
        signal: new AbortController().signal,
        onUploadProgress: vi.fn<(value: UploadProgress) => void>(),
      }),
    ).toMatchObject({ ok: false, status: 400, uncertain: false });
    expect(TestXhr.instances).toHaveLength(0);
  });
});
