import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requestApi } from '../client';
import { apiResponse, retryAfter } from '../result';
import { emptyResponseSchema, loginResponseSchema } from '../../contracts/auth';
import { handleCmsRequest, handleExpiredSession } from '../../server/bff';

let backend: Awaited<ReturnType<typeof listen>>;
let frontend: Awaited<ReturnType<typeof listen>>;
let backendHandler: (request: IncomingMessage, response: ServerResponse) => void;
let browserCookie: string;
let received: { path: string; method: string; body: Buffer; key: string | undefined }[];
const nativeFetch = globalThis.fetch;

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP address');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      const pending = new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      server.closeAllConnections();
      await pending;
    },
  };
}

async function serveBff(request: IncomingMessage, response: ServerResponse) {
  const chunks: Uint8Array[] = [];
  for await (const input of request) {
    const chunk: unknown = input;
    if (!(chunk instanceof Uint8Array)) throw new Error('Expected HTTP bytes');
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers))
    if (typeof value === 'string') headers.set(name, value);
  const req = new Request(new URL(request.url ?? '/', frontend.origin), {
    method: request.method ?? 'GET',
    headers,
    body: body.length > 0 ? body : null,
  });
  const handler = req.url.includes('/api/auth/expired-session')
    ? handleExpiredSession
    : handleCmsRequest;
  const reply = await handler(req);
  response.writeHead(reply.status, Object.fromEntries(reply.headers));
  response.end(Buffer.from(await reply.arrayBuffer()));
}

function json(response: ServerResponse, value: unknown, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': 'client-request',
  });
  response.end(JSON.stringify(value));
}

function sendFailure(response: ServerResponse, code: string, status: number) {
  json(
    response,
    {
      error: {
        code,
        message: 'Safe failure',
        requestId: 'client-request',
        fieldErrors: [{ field: 'email', message: 'Invalid email' }],
      },
    },
    status,
  );
}

beforeAll(async () => {
  backend = await listen((req, res) => {
    const chunks: Uint8Array[] = [];
    req.on('data', (chunk: unknown) => {
      if (chunk instanceof Uint8Array) chunks.push(chunk);
    });
    req.on('end', () => {
      received.push({
        path: req.url ?? '',
        method: req.method ?? '',
        body: Buffer.concat(chunks),
        key:
          typeof req.headers['idempotency-key'] === 'string'
            ? req.headers['idempotency-key']
            : undefined,
      });
      backendHandler(req, res);
    });
  });
  frontend = await listen((req, res) => {
    void serveBff(req, res);
  });
  vi.stubEnv('CMS_API_BASE_URL', backend.origin);
  vi.stubEnv('CMS_ADMIN_ORIGIN', frontend.origin);
  vi.stubGlobal('fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (typeof input !== 'string' || !input.startsWith('/')) return nativeFetch(input, init);
    const headers = new Headers(init?.headers);
    headers.set('origin', frontend.origin);
    if (browserCookie) headers.set('cookie', browserCookie);
    const response = await nativeFetch(new URL(input, frontend.origin), { ...init, headers });
    const cookie = response.headers.get('set-cookie');
    if (cookie) browserCookie = cookie.split(';')[0] ?? '';
    return response;
  });
});

afterAll(async () => {
  await frontend.close();
  await backend.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
afterEach(() => {
  vi.useRealTimers();
});
beforeEach(() => {
  browserCookie = 'oneaster-session=current-session';
  received = [];
  backendHandler = (req, res) => {
    if (req.url === '/v1/auth/login')
      return json(res, {
        token: 'token-hidden-from-client',
        tokenType: 'Bearer',
        expiresAt: '2100-01-01T00:00:00Z',
      });
    if (req.url === '/v1/auth/logout') {
      res.writeHead(204);
      res.end();
      return;
    }
    json(res, { accepted: true });
  };
});

function signal() {
  return new AbortController().signal;
}

describe('single browser API client against real BFF HTTP', () => {
  it('returns login projection and never exposes the backend token', async () => {
    const result = await requestApi({
      operation: 'identity.login',
      body: { email: 'admin@example.com', password: '  keep spaces  ' },
      response: loginResponseSchema,
      signal: signal(),
    });
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { expiresAt: '2100-01-01T00:00:00Z' },
      requestId: 'client-request',
    });
    expect(browserCookie).toBe('oneaster-session=token-hidden-from-client');
    expect(JSON.parse(received[0]?.body.toString() ?? '{}')).toEqual({
      email: 'admin@example.com',
      password: '  keep spaces  ',
    });
  });

  it('handles 204 with an explicit empty schema and frontend-only session cleanup', async () => {
    const logout = await requestApi({
      operation: 'identity.logout',
      response: emptyResponseSchema,
      signal: signal(),
    });
    expect(logout).toEqual({ ok: true, status: 204, data: undefined, requestId: '' });
    browserCookie = '';
    const expired = await requestApi({
      operation: 'session.expire',
      response: emptyResponseSchema,
      signal: signal(),
    });
    expect(expired).toMatchObject({ ok: true, status: 204 });
    expect(received).toHaveLength(1);
  });

  it('preserves validation fields and Retry-After with confirmed backend errors', async () => {
    backendHandler = (_, res) => {
      res.setHeader('retry-after', '11');
      sendFailure(res, 'rate_limited', 429);
    };
    const result = await requestApi({
      operation: 'identity.login',
      body: {},
      response: loginResponseSchema,
      signal: signal(),
    });
    expect(result).toEqual({
      ok: false,
      status: 429,
      error: {
        code: 'rate_limited',
        message: 'Safe failure',
        requestId: 'client-request',
        fieldErrors: [{ field: 'email', message: 'Invalid email' }],
      },
      retryAfterSeconds: 11,
      uncertain: false,
    });
  });

  it('keeps one caller-provided idempotency key and never automatically retries', async () => {
    backendHandler = (_, res) => sendFailure(res, 'version_conflict', 409);
    const result = await requestApi({
      operation: 'admins.create',
      body: { email: 'person@example.com' },
      idempotencyKey: 'same-intent-00000001',
      response: z.unknown(),
      signal: signal(),
    });
    expect(result).toMatchObject({ ok: false, status: 409, uncertain: false });
    expect(received).toHaveLength(1);
    expect(received[0]?.key).toBe('same-intent-00000001');
  });

  it('rejects illegal path, query, body and idempotency before making HTTP requests', async () => {
    const results = await Promise.all([
      requestApi({
        operation: 'admins.get',
        params: { id: '../me' },
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({
        operation: 'roles.list',
        query: { status: 'active' },
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({ operation: 'admins.create', body: {}, response: z.unknown(), signal: signal() }),
      requestApi({
        operation: 'admins.create',
        body: {},
        idempotencyKey: 'bad key',
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({
        operation: 'identity.login',
        body: {},
        idempotencyKey: 'not-supported',
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({ operation: 'identity.login', response: z.unknown(), signal: signal() }),
      requestApi({
        operation: 'identity.logout',
        body: {},
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({
        operation: 'assets.writeUpload',
        params: { collection: 'media', uploadId: 'upload' },
        body: 'wrong-bytes',
        response: z.unknown(),
        signal: signal(),
      }),
    ]);
    expect(
      results.every((result) => !result.ok && result.status === 400 && !result.uncertain),
    ).toBe(true);
    expect(received).toHaveLength(0);
  });

  it('enforces JSON and byte budgets in the browser before dispatch', async () => {
    const results = await Promise.all([
      requestApi({
        operation: 'identity.login',
        body: { password: 'x'.repeat(1048576) },
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({
        operation: 'assets.writeUpload',
        params: { collection: 'media', uploadId: 'upload' },
        body: new Blob([new ArrayBuffer(33554433)]),
        response: z.unknown(),
        signal: signal(),
      }),
      requestApi({
        operation: 'assets.writeUpload',
        params: { collection: 'media', uploadId: 'upload' },
        body: new ArrayBuffer(33554433),
        response: z.unknown(),
        signal: signal(),
      }),
    ]);
    expect(
      results.every((result) => !result.ok && result.status === 413 && !result.uncertain),
    ).toBe(true);
    expect(received).toHaveLength(0);
  });

  it('sends Blob and ArrayBuffer upload bytes without JSON encoding', async () => {
    for (const body of [
      new Blob([new Uint8Array([0, 128, 255])]),
      new Uint8Array([0, 128, 255]).buffer,
    ]) {
      const result = await requestApi({
        operation: 'assets.writeUpload',
        params: { collection: 'media', uploadId: 'upload' },
        body,
        response: z.object({ accepted: z.literal(true) }),
        signal: signal(),
      });
      expect(result.ok).toBe(true);
    }
    expect(received.map((value) => Array.from(value.body))).toEqual([
      [0, 128, 255],
      [0, 128, 255],
    ]);
  });

  it('serializes query semantics exactly through client, BFF and backend', async () => {
    await requestApi({
      operation: 'documents.list',
      params: { collection: 'articles' },
      query: { fallback: [], trashed: true, depth: 0 },
      response: z.unknown(),
      signal: signal(),
    });
    expect(received[0]?.path).toBe(
      '/v1/collections/articles/documents?fallback=%5B%5D&trashed=true&depth=0',
    );
    expect(received[0]?.method).toBe('GET');
  });

  it('distinguishes cancellation before dispatch from an uncertain write after dispatch', async () => {
    const before = new AbortController();
    before.abort();
    const cancelled = await requestApi({
      operation: 'identity.login',
      body: {},
      response: loginResponseSchema,
      signal: before.signal,
    });
    expect(cancelled).toMatchObject({
      ok: false,
      status: 0,
      error: { code: 'request_cancelled' },
      uncertain: false,
    });
    let started: (() => void) | undefined;
    const reached = new Promise<void>((resolve) => {
      started = resolve;
    });
    backendHandler = () => {
      started?.();
    };
    const after = new AbortController();
    const pending = requestApi({
      operation: 'identity.login',
      body: {},
      response: loginResponseSchema,
      signal: after.signal,
    });
    await reached;
    after.abort();
    expect(await pending).toMatchObject({
      ok: false,
      status: 0,
      error: { code: 'request_cancelled' },
      uncertain: true,
    });
    expect(received).toHaveLength(1);
  });

  it('reports a write transport failure as uncertain and does not retry', async () => {
    backendHandler = (req) => {
      req.socket.destroy();
    };
    const result = await requestApi({
      operation: 'identity.login',
      body: {},
      response: loginResponseSchema,
      signal: signal(),
    });
    expect(result).toMatchObject({
      ok: false,
      status: 503,
      error: { code: 'backend_unavailable' },
      uncertain: true,
    });
    expect(received).toHaveLength(1);
  });
});

describe('response decoding contract', () => {
  it('handles malformed success and failure JSON without exposing response contents', async () => {
    expect(
      await apiResponse(new Response('private stack', { status: 200 }), z.unknown(), true),
    ).toMatchObject({
      ok: false,
      status: 200,
      error: { code: 'invalid_response' },
      uncertain: true,
    });
    expect(
      await apiResponse(new Response('private stack', { status: 502 }), z.unknown(), true),
    ).toMatchObject({
      ok: false,
      status: 502,
      error: { code: 'invalid_response' },
      uncertain: true,
    });
    expect(
      await apiResponse(Response.json({ wrong: 'shape' }, { status: 400 }), z.unknown(), true),
    ).toMatchObject({ ok: false, error: { code: 'invalid_response' }, uncertain: true });
    expect(
      await apiResponse(
        Response.json({ wrong: 'shape' }),
        z.object({ accepted: z.boolean() }),
        true,
      ),
    ).toMatchObject({ ok: false, error: { code: 'invalid_response' }, uncertain: true });
  });

  it.each([400, 502])(
    'marks unknown gateway or malformed error responses as uncertain writes at HTTP %s',
    async (status) => {
      const html = await apiResponse(
        new Response('<html>Bad Gateway</html>', { status }),
        loginResponseSchema,
        true,
      );
      const malformed = await apiResponse(
        Response.json({ error: { wrong: 'shape' } }, { status }),
        loginResponseSchema,
        true,
      );
      expect(html).toMatchObject({
        ok: false,
        status,
        error: { code: 'invalid_response' },
        uncertain: true,
      });
      expect(malformed).toMatchObject({
        ok: false,
        status,
        error: { code: 'invalid_response' },
        uncertain: true,
      });
      expect(
        await apiResponse(
          new Response('<html>Bad Gateway</html>', { status }),
          loginResponseSchema,
          false,
        ),
      ).toMatchObject({ ok: false, status, uncertain: false });
    },
  );

  it('does not hide cancellation while decoding a response body', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new DOMException('Cancelled', 'AbortError'));
        },
      }),
    );
    await expect(apiResponse(response, z.unknown(), false)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });

  it('parses only valid bounded Retry-After seconds or HTTP dates', () => {
    expect(retryAfter(null)).toBeNull();
    expect(retryAfter('not-a-date')).toBeNull();
    expect(retryAfter('999999999999999999999')).toBeNull();
    expect(retryAfter('0')).toBe(0);
    expect(retryAfter('12')).toBe(12);
    const now = new Date('2026-10-26T00:00:00Z');
    vi.setSystemTime(now);
    expect(retryAfter('Mon, 26 Oct 2026 00:00:10 GMT')).toBe(10);
    expect(retryAfter('Mon, 26 Oct 2026 00:00:00 GMT')).toBe(0);
    vi.useRealTimers();
  });
});
