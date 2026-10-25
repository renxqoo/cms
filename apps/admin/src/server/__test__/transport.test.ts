import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { getOperation } from '../../contracts/operations';
import { apiResponse } from '../../api/result';
import { loadAdminConfig } from '../config';
import { fetchBackend, requestLifetime } from '../transport';
import { limitedJson } from '../body';
import { limitedStream } from '../streams';
import { TransportError } from '../errors';
import { httpFixture } from './support';

let fixture: Awaited<ReturnType<typeof httpFixture>>;
let handler: (request: IncomingMessage, response: ServerResponse) => void;

beforeAll(async () => {
  fixture = await httpFixture((req, res) => handler(req, res));
});
afterAll(async () => {
  await fixture.close();
});

function configuration() {
  return {
    ...loadAdminConfig(),
    apiBaseUrl: fixture.origin,
    requestTimeoutMs: 35,
    streamTimeoutMs: 50,
    byteLimit: 8,
    jsonResponseBytes: 32,
  };
}

function bytes(value: string): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(value));
      controller.close();
    },
  });
}

describe('HTTP request cancellation and bounded streaming', () => {
  it('aborts an upstream HTTP request that never sends response headers', async () => {
    handler = () => {};
    await expect(
      fetchBackend({
        operation: getOperation('access.me'),
        path: '/v1/me',
        config: configuration(),
      }),
    ).rejects.toMatchObject({ code: 'request_timeout', status: 503 });
  });

  it('aborts an upstream body that stops after response headers and classifies uncertain writes', async () => {
    handler = (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{');
    };
    const response = await fetchBackend({
      operation: getOperation('identity.login'),
      path: '/v1/auth/login',
      body: '{}',
      config: configuration(),
    });
    const result = await apiResponse(response, z.unknown(), true);
    expect(result).toMatchObject({
      ok: false,
      status: 503,
      error: { code: 'request_timeout' },
      uncertain: true,
    });
  });

  it('releases the upstream response when the caller aborts a read', async () => {
    handler = (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.write('{');
    };
    const controller = new AbortController();
    const response = await fetchBackend({
      operation: getOperation('access.me'),
      path: '/v1/me',
      config: configuration(),
      signal: controller.signal,
    });
    controller.abort();
    await expect(response.text()).rejects.toMatchObject({ code: 'request_cancelled' });
  });

  it('does not fetch a cancelled request or retain its timer', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchBackend({
        operation: getOperation('access.me'),
        path: '/v1/me',
        config: configuration(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: 'request_cancelled' });
  });

  it('cancels an over-budget upload stream instead of buffering it', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(10));
      },
      cancel() {
        cancelled = true;
      },
    });
    handler = (req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(200);
        res.end('{}');
      });
    };
    await expect(
      fetchBackend({
        operation: getOperation('assets.writeUpload'),
        path: '/upload',
        config: configuration(),
        body,
      }),
    ).rejects.toMatchObject({ code: 'payload_too_large', status: 413 });
    expect(cancelled).toBe(true);
  });

  it('fails an over-budget download stream by its actual bytes', async () => {
    handler = (_, res) => {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end('0123456789');
    };
    const response = await fetchBackend({
      operation: getOperation('assets.download'),
      path: '/file',
      config: configuration(),
    });
    await expect(response.text()).rejects.toMatchObject({ code: 'payload_too_large', status: 413 });
  });

  it('cancels the source when the download consumer closes early', async () => {
    let cancelled = false;
    let finished = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const stream = limitedStream(source, {
      maximum: 10,
      highWaterMark: 2,
      signal: new AbortController().signal,
      finish() {
        finished += 1;
      },
    });
    const reader = stream.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1]));
    await reader.cancel('closed');
    expect(cancelled).toBe(true);
    expect(finished).toBe(1);
  });

  it('preserves source errors and releases a stopped stream exactly once', async () => {
    const error = new Error('source failed');
    let finished = 0;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(error);
      },
    });
    const stream = limitedStream(source, {
      maximum: 10,
      highWaterMark: 2,
      signal: new AbortController().signal,
      finish() {
        finished += 1;
      },
    });
    await expect(new Response(stream).text()).rejects.toThrow('source failed');
    expect(finished).toBe(1);
  });

  it('aborts already-cancelled streams and cleans the source', async () => {
    const controller = new AbortController();
    controller.abort(new Error('already closed'));
    let cancelled = false;
    const source = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const stream = limitedStream(source, {
      maximum: 10,
      highWaterMark: 2,
      signal: controller.signal,
      finish() {},
    });
    await expect(new Response(stream).text()).rejects.toThrow('already closed');
    expect(cancelled).toBe(true);
  });

  it('cleans linked cancellation listeners and timeout after completion', async () => {
    const controller = new AbortController();
    const lifetime = requestLifetime(controller.signal, 10);
    lifetime.close();
    controller.abort();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(lifetime.signal.aborted).toBe(false);
    expect(lifetime.timedOut()).toBe(false);
  });

  it('reports socket failures as service failures without exposing their exception', async () => {
    handler = (req) => {
      req.socket.destroy();
    };
    await expect(
      fetchBackend({
        operation: getOperation('access.me'),
        path: '/v1/me',
        config: configuration(),
      }),
    ).rejects.toMatchObject({
      code: 'backend_unavailable',
      status: 503,
      message: 'The request could not be completed.',
    });
  });
});

describe('bounded JSON reader', () => {
  it('reads split UTF-8 JSON and accepts exact byte limit', async () => {
    const stream = bytes('{"value":"你"}');
    expect(await limitedJson(new Response(stream), 15)).toEqual({ value: '你' });
  });

  it('rejects missing body, malformed length, oversized bytes and invalid UTF-8', async () => {
    await expect(limitedJson(new Response(null), 10)).rejects.toMatchObject({
      code: 'invalid_input',
    });
    await expect(
      limitedJson(new Response('{}', { headers: { 'content-length': 'bad' } }), 10),
    ).rejects.toMatchObject({ code: 'payload_too_large' });
    await expect(limitedJson(new Response(bytes('{"tooLarge":true}')), 10)).rejects.toMatchObject({
      code: 'payload_too_large',
    });
    await expect(limitedJson(new Response(new Uint8Array([255])), 10)).rejects.toMatchObject({
      code: 'invalid_input',
    });
  });

  it('cancels a pending read when its lifetime ends', async () => {
    let cancelled = false;
    const controller = new AbortController();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
    );
    const result = limitedJson(response, 10, controller.signal);
    controller.abort(new TransportError('request_cancelled', 503));
    await expect(result).rejects.toMatchObject({ code: 'request_cancelled' });
    expect(cancelled).toBe(true);
  });

  it('cancels an already-aborted JSON read without consuming bytes', async () => {
    const controller = new AbortController();
    controller.abort(new Error('closed before read'));
    await expect(limitedJson(new Response('{}'), 10, controller.signal)).rejects.toThrow(
      'closed before read',
    );
  });
});
