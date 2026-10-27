import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';
import { NextRequest } from 'next/server';
import { GET, HEAD, POST, PUT, PATCH, DELETE } from '../../app/api/cms/[...path]/route';
import { POST as expire } from '../../app/api/auth/expired-session/route';
import { handleCmsRequest } from '../bff';
import { requestBackend } from '../api';
import { loadAdminConfig } from '../config';
import { errorSchema } from '../../api/result';
import { backendLoginSchema, sessionCookie, sessionToken } from '../session';
import { meSchema, emptyResponseSchema, loginResponseSchema } from '../../contracts/auth';
import { httpFixture, incomingBody, principal, sendError, sendJson } from './support';

let fixture: Awaited<ReturnType<typeof httpFixture>>;
let handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
let requests: { path: string; headers: IncomingMessage['headers']; body: string }[];
let loginStatus = 200;
const origin = 'http://localhost:3000';
const cookie = 'oneaster-session=opaque-session';

function request(
  path: string,
  method = 'GET',
  options: { body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
) {
  return new Request(`${origin}/api/cms${path}`, {
    method,
    headers: {
      origin,
      cookie,
      ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      ...options.headers,
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

function expired(headers: Record<string, string> = { cookie }) {
  return new Request(`${origin}/api/auth/expired-session`, {
    method: 'POST',
    headers: { origin, ...headers },
  });
}

beforeAll(async () => {
  fixture = await httpFixture((req, res) => handler(req, res));
  vi.stubEnv('CMS_API_BASE_URL', fixture.origin);
  vi.stubEnv('CMS_ADMIN_ORIGIN', origin);
});

afterAll(async () => {
  await fixture.close();
  vi.unstubAllEnvs();
});

beforeEach(() => {
  requests = [];
  loginStatus = 200;
  handler = async (req, res) => {
    const body = await incomingBody(req);
    requests.push({ path: req.url ?? '', headers: req.headers, body });
    if (req.url === '/v1/auth/login') {
      if (loginStatus !== 200) return sendError(res, 'invalid_credentials', loginStatus);
      return sendJson(res, {
        token: 'opaque-token',
        tokenType: 'Bearer',
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        internalSecret: 'hidden',
      });
    }
    if (req.url === '/v1/me')
      return sendJson(res, { ...principal, token: 'must-never-reach-browser' });
    if (req.url === '/v1/auth/logout' || req.url === '/v1/me/password') {
      res.writeHead(204);
      res.end();
      return;
    }
    sendJson(res, { accepted: true });
  };
});

describe('safe BFF authentication and HTTP boundary', () => {
  it('returns only expiresAt and sets an absolute host-only HttpOnly login cookie', async () => {
    const response = await POST(
      request('/v1/auth/login', 'POST', {
        body: { email: 'admin@example.com', password: '  password spaces  ' },
        headers: {
          authorization: 'Bearer forged',
          forwarded: 'for=spoofed',
          'x-forwarded-for': 'spoofed',
          host: 'spoofed',
        },
      }),
    );
    expect(response.status).toBe(200);
    const value = loginResponseSchema.parse(await response.json());
    expect(Object.keys(value)).toEqual(['expiresAt']);
    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toContain(
      'oneaster-session=opaque-token; Path=/; HttpOnly; SameSite=Lax; Expires=',
    );
    expect(setCookie).not.toContain('Secure');
    expect(setCookie).not.toContain('Domain');
    expect(setCookie).not.toContain('Max-Age');
    expect(Date.parse(setCookie?.split('Expires=')[1] ?? '')).toBeLessThanOrEqual(
      Date.parse(value.expiresAt),
    );
    expect(requests[0]?.headers.authorization).toBeUndefined();
    expect(requests[0]?.headers.cookie).toBeUndefined();
    expect(requests[0]?.headers.forwarded).toBeUndefined();
    expect(requests[0]?.headers['x-forwarded-for']).toBeUndefined();
    expect(requests[0]?.headers.host).toBe(new URL(fixture.origin).host);
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({
      email: 'admin@example.com',
      password: '  password spaces  ',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-private-internal')).toBeNull();
    expect(response.headers.get('x-request-id')).toBe('request-123');
  });

  it('reads the opaque cookie and projects Me without extra private fields', async () => {
    const response = await GET(
      request('/v1/me', 'GET', { headers: { authorization: 'Bearer spoofed' } }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(principal);
    expect(requests[0]?.headers.authorization).toBe('Bearer opaque-session');
  });

  it.each([
    undefined,
    'null',
    'https://attacker.example',
    'http://localhost:3000/',
    'http://localhost:3000.attacker.example',
  ])('rejects mutating request Origin %s before calling backend', async (badOrigin) => {
    const req = request('/v1/auth/login', 'POST', { body: {} });
    if (badOrigin === undefined) req.headers.delete('origin');
    else req.headers.set('origin', badOrigin);
    const response = await POST(req);
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it.each([
    ['/v1/unknown', 'GET'],
    ['/livez', 'GET'],
    ['/readyz', 'GET'],
    ['/v1/%6de', 'GET'],
    ['/v1/me/extra', 'GET'],
    ['/v1/me/', 'GET'],
    ['/v1/me', 'POST'],
    ['/v1/me', 'HEAD'],
    ['/api/auth/expired-session', 'POST'],
  ])('rejects unregistered path or method %s %s', async (path, method) => {
    const response = await handleCmsRequest(request(path, method));
    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(requests).toHaveLength(0);
  });

  it('rejects paths outside the BFF mount', async () => {
    expect((await GET(new Request(`${origin}/v1/me`))).status).toBe(404);
  });

  it.each([
    '/v1/roles?status=active',
    '/v1/endpoints?q=test',
    '/v1/me?page=1',
    '/v1/me/operations?page=1&page=2',
  ])('rejects illegal and repeated query parameters %s', async (path) => {
    expect((await GET(request(path))).status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it('preserves legal collection query semantics and conditional DELETE revision', async () => {
    await GET(
      request(
        '/v1/collections/articles/documents?fallback=%5B%5D&depth=0&trashed=false&folderId=null',
      ),
    );
    await DELETE(request('/v1/collections/articles/documents/doc-1?revision=8', 'DELETE'));
    expect(requests.map((value) => value.path)).toEqual([
      '/v1/collections/articles/documents?fallback=%5B%5D&depth=0&trashed=false&folderId=null',
      '/v1/collections/articles/documents/doc-1?revision=8',
    ]);
  });

  it('enforces idempotency only for operations that promise replay', async () => {
    expect((await POST(request('/v1/admins', 'POST', { body: {} }))).status).toBe(400);
    expect(
      (
        await POST(
          request('/v1/auth/login', 'POST', {
            body: {},
            headers: { 'idempotency-key': 'unpromised' },
          }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request('/v1/admins', 'POST', {
            body: {},
            headers: { 'idempotency-key': 'contains space' },
          }),
        )
      ).status,
    ).toBe(400);
    const response = await POST(
      request('/v1/admins', 'POST', {
        body: {},
        headers: { 'idempotency-key': 'intent-0000000123' },
      }),
    );
    expect(response.status).toBe(200);
    expect(requests[0]?.headers['idempotency-key']).toBe('intent-0000000123');
  });

  it('accepts the backend printable ASCII idempotency contract including internal spaces', async () => {
    const response = await POST(
      request('/v1/admins', 'POST', {
        body: {},
        headers: { 'idempotency-key': 'valid key for intent-1' },
      }),
    );
    expect(response.status).toBe(200);
    expect(requests[0]?.headers['idempotency-key']).toBe('valid key for intent-1');
  });

  it('rejects missing or duplicate credentials locally without forwarding an attacker Authorization', async () => {
    for (const header of [
      '',
      `${cookie}; ${cookie}`,
      'oneaster-session=%3B',
      'other-cookie=value',
    ]) {
      const response = await GET(
        request('/v1/me', 'GET', {
          headers: { cookie: header, authorization: 'Bearer arbitrary' },
        }),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(requests).toHaveLength(0);
  });

  it.each([
    ['unauthenticated', 401, false],
    ['invalid_credentials', 401, false],
    ['forbidden', 403, false],
    ['endpoint_unbound', 403, false],
  ])(
    'handles protected %s without confusing auth and permission failure',
    async (code, status, clears) => {
      handler = (_, res) => sendError(res, code, status);
      const response = await GET(request('/v1/me'));
      expect(response.status).toBe(status);
      expect(response.headers.has('set-cookie')).toBe(clears);
      expect(await response.json()).toEqual({
        error: {
          code,
          message: 'A safe upstream error',
          requestId: 'request-123',
          fieldErrors: [{ field: 'email', message: 'Invalid input' }],
        },
      });
    },
  );

  it.each(['protected-read', 'expired-session'] as const)(
    'does not delete a newer login cookie when an old %s 401 arrives late',
    async (kind) => {
      let reached: (() => void) | undefined;
      let release: (() => void) | undefined;
      const started = new Promise<void>((resolve) => {
        reached = resolve;
      });
      const deferred = new Promise<void>((resolve) => {
        release = resolve;
      });
      handler = async (req, res) => {
        if (req.url === '/v1/me') {
          reached?.();
          await deferred;
          sendError(res, 'unauthenticated', 401);
          return;
        }
        sendJson(res, {
          token: 'new-valid-session',
          tokenType: 'Bearer',
          expiresAt: '2100-01-01T00:00:00Z',
        });
      };
      const stale =
        kind === 'protected-read'
          ? GET(request('/v1/me'))
          : expire(
              new Request(`${origin}/api/auth/expired-session`, {
                method: 'POST',
                headers: { origin, cookie },
              }),
            );
      await started;
      const login = await POST(request('/v1/auth/login', 'POST', { body: {} }));
      expect(login.status).toBe(200);
      expect(login.headers.get('set-cookie')).toContain('oneaster-session=new-valid-session');
      release?.();
      const oldResponse = await stale;
      expect(oldResponse.status).toBe(kind === 'protected-read' ? 401 : 204);
      expect(oldResponse.headers.get('set-cookie')).toBeNull();
    },
  );

  it('does not clear an established session on failed public login', async () => {
    loginStatus = 401;
    const response = await POST(request('/v1/auth/login', 'POST', { body: {} }));
    expect(response.status).toBe(401);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('preserves safe error fields and Retry-After while discarding backend headers', async () => {
    handler = (_, res) => {
      res.setHeader('retry-after', '17');
      sendError(res, 'rate_limited', 429);
    };
    const response = await POST(request('/v1/auth/login', 'POST', { body: {} }));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('17');
    expect(response.headers.get('x-private-internal')).toBeNull();
  });

  it('logout clears the local session and reports upstream revocation failure honestly', async () => {
    handler = (_, res) => sendError(res, 'temporarily_unavailable', 503);
    const response = await POST(request('/v1/auth/logout', 'POST'));
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(errorSchema.parse(await response.json()).error.code).toBe('temporarily_unavailable');
  });

  it('does not let cross-origin logout clear the local cookie', async () => {
    const response = await POST(
      request('/v1/auth/logout', 'POST', { headers: { origin: 'https://attacker.example' } }),
    );
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('keeps empty logout and password responses empty and clears the cookie', async () => {
    const logout = await POST(request('/v1/auth/logout', 'POST'));
    const password = await PUT(
      request('/v1/me/password', 'PUT', {
        body: { currentPassword: 'current', newPassword: 'new' },
      }),
    );
    for (const response of [logout, password]) {
      expect(response.status).toBe(204);
      expect(await response.text()).toBe('');
      expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
      expect(response.headers.get('cache-control')).toBe('no-store');
    }
  });

  it('accepts Next bodyKind none requests with Content-Length 0 and a non-null empty stream', async () => {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { origin, cookie, 'content-length': '0' },
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      duplex: 'half',
    };
    const next = new NextRequest(new Request(`${origin}/api/cms/v1/auth/logout`, init));
    expect(next.body).not.toBeNull();
    const response = await POST(next);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  it('cancels unread request streams when Origin validation rejects the request', async () => {
    let cancelled = false;
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { origin: 'null', cookie, 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
      duplex: 'half',
    };
    const response = await POST(new Request(`${origin}/api/cms/v1/auth/login`, init));
    expect(response.status).toBe(403);
    expect(cancelled).toBe(true);
  });

  it('does not accept JSON bodies for reads, DELETE or logout', async () => {
    const response = await POST(request('/v1/auth/logout', 'POST', { body: {} }));
    expect(response.status).toBe(400);
    expect(requests).toHaveLength(0);
  });

  it.each([null, [], 'scalar'])('rejects a non-object JSON request body %s', async (body) => {
    expect((await POST(request('/v1/auth/login', 'POST', { body }))).status).toBe(400);
  });

  it('rejects malformed JSON, unsupported media and encoded bodies', async () => {
    const malformed = request('/v1/auth/login', 'POST', { body: {} });
    const raw = new Request(malformed.url, {
      method: 'POST',
      headers: malformed.headers,
      body: '{bad-json',
    });
    expect((await POST(raw)).status).toBe(400);
    expect(
      (
        await POST(
          request('/v1/auth/login', 'POST', {
            body: {},
            headers: { 'content-type': 'text/plain' },
          }),
        )
      ).status,
    ).toBe(415);
    expect(
      (
        await POST(
          request('/v1/auth/login', 'POST', { body: {}, headers: { 'content-encoding': 'gzip' } }),
        )
      ).status,
    ).toBe(415);
  });

  it('caps JSON requests both by content length and actual streamed bytes', async () => {
    expect(
      (
        await POST(
          request('/v1/auth/login', 'POST', { body: {}, headers: { 'content-length': '1048577' } }),
        )
      ).status,
    ).toBe(413);
    expect(
      (await POST(request('/v1/auth/login', 'POST', { body: { password: 'x'.repeat(1048576) } })))
        .status,
    ).toBe(413);
    expect(requests).toHaveLength(0);
  });

  it('does not return a token if login expiry or payload is invalid', async () => {
    for (const payload of [
      { token: 'secret', tokenType: 'Bearer', expiresAt: '2000-01-01T00:00:00Z' },
      { token: 'contains;cookie', tokenType: 'Bearer', expiresAt: '2100-01-01T00:00:00Z' },
      { wrong: 'shape' },
    ]) {
      handler = (_, res) => sendJson(res, payload);
      const response = await POST(request('/v1/auth/login', 'POST', { body: {} }));
      expect(response.status).toBe(503);
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(await response.text()).not.toContain('secret');
    }
  });

  it('converts malformed and non-JSON responses into safe failures without leaking content', async () => {
    for (const status of [200, 500]) {
      handler = (_, res) => {
        res.writeHead(status, { 'content-type': 'text/html' });
        res.end('<script>private-stack</script>');
      };
      const response = await GET(request('/v1/me'));
      expect(response.status).toBe(status === 200 ? 503 : 500);
      expect(await response.text()).not.toContain('private-stack');
    }
    handler = (_, res) => sendJson(res, { wrong: 'shape' });
    expect((await GET(request('/v1/me'))).status).toBe(503);
    expect((await POST(request('/v1/auth/logout', 'POST'))).status).toBe(503);
  });

  it('caps backend JSON by declared and actual response bytes', async () => {
    handler = (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json', 'content-length': '2097153' });
      res.end('{}');
    };
    expect((await GET(request('/v1/me'))).status).toBe(503);
    handler = (_, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: 'x'.repeat(2097152) }));
    };
    expect((await GET(request('/v1/me'))).status).toBe(503);
  });

  it('forwards HEAD private file metadata safely and streams exact file bytes', async () => {
    handler = (req, res) => {
      requests.push({ path: req.url ?? '', headers: req.headers, body: '' });
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': '5',
        'content-disposition': 'attachment; filename="download"; filename*=UTF-8\'\'report.pdf',
        etag: '"digest"',
        'set-cookie': 'malicious=secret',
        'x-internal-storage': '/private/storage',
      });
      res.end(req.method === 'HEAD' ? undefined : 'bytes');
    };
    const file = await GET(request('/v1/collections/media/documents/doc-1/file?mode=editing'));
    expect(await file.text()).toBe('bytes');
    expect(file.headers.get('etag')).toBe('"digest"');
    expect(file.headers.get('content-disposition')).toContain('report.pdf');
    expect(file.headers.get('set-cookie')).toBeNull();
    expect(file.headers.get('x-internal-storage')).toBeNull();
    const head = await HEAD(request('/v1/collections/media/documents/doc-1/file', 'HEAD'));
    expect(await head.text()).toBe('');
    expect(head.headers.get('content-length')).toBe('5');
  });

  it('streams raw upload bytes to the backend without JSON encoding', async () => {
    const upload = new Request(`${origin}/api/cms/v1/collections/media/uploads/upload-1/content`, {
      method: 'PUT',
      headers: { origin, cookie, 'content-type': 'application/octet-stream' },
      body: new Uint8Array([0, 1, 2, 255]),
    });
    const bytes: number[] = [];
    handler = async (req, res) => {
      for await (const chunk of req) bytes.push(...new Uint8Array(chunk));
      sendJson(res, { written: true });
    };
    expect((await PUT(upload)).status).toBe(200);
    expect(bytes).toEqual([0, 1, 2, 255]);
  });

  it('rejects missing, encoded, or oversized raw upload bodies', async () => {
    for (const headers of [
      { 'content-type': 'application/json' },
      { 'content-type': 'application/octet-stream', 'content-length': '33554433' },
      { 'content-type': 'application/octet-stream', 'content-encoding': 'gzip' },
    ]) {
      const response = await PUT(
        new Request(`${origin}/api/cms/v1/collections/media/uploads/upload-1/content`, {
          method: 'PUT',
          headers: { origin, cookie, ...headers },
          body: 'bytes',
        }),
      );
      expect([413, 415]).toContain(response.status);
    }
    expect(
      (
        await PUT(
          new Request(`${origin}/api/cms/v1/collections/media/uploads/upload-1/content`, {
            method: 'PUT',
            headers: { origin, cookie, 'content-type': 'application/octet-stream' },
          }),
        )
      ).status,
    ).toBe(400);
  });

  it('does not follow an upstream redirect to another endpoint', async () => {
    handler = (_, res) => {
      res.writeHead(302, { location: '/v1/auth/login' });
      res.end();
    };
    const response = await GET(request('/v1/me'));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('opaque-token');
  });

  it('forwards each registered PATCH and protected OpenAPI using the same no-store boundary', async () => {
    await PATCH(request('/v1/me', 'PATCH', { body: { version: 1, displayName: 'New' } }));
    const response = await GET(request('/openapi.json'));
    expect(response.status).toBe(200);
    expect(requests.map((value) => value.path)).toEqual(['/v1/me', '/openapi.json']);
  });
});

describe('expired-session race-safe cleanup', () => {
  it('validates an expired Next request with Content-Length 0 and a non-null empty stream', async () => {
    const init: RequestInit & { duplex: 'half' } = {
      method: 'POST',
      headers: { origin, 'content-length': '0' },
      body: new ReadableStream({
        start(controller) {
          controller.close();
        },
      }),
      duplex: 'half',
    };
    const next = new NextRequest(new Request(`${origin}/api/auth/expired-session`, init));
    expect(next.body).not.toBeNull();
    const response = await expire(next);
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('accepts absent credentials without making a backend call', async () => {
    const response = await expire(expired({}));
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(requests).toHaveLength(0);
  });

  it('returns 204 without writing cookies after the backend confirms unauthenticated', async () => {
    handler = (_, res) => sendError(res, 'unauthenticated', 401);
    const response = await expire(expired());
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('preserves a newer valid session with a 409 session_changed result', async () => {
    const response = await expire(expired({ cookie: 'oneaster-session=new-session' }));
    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(errorSchema.parse(await response.json()).error.code).toBe('session_changed');
    expect(requests[0]?.headers.authorization).toBe('Bearer new-session');
  });

  it.each([401, 403, 503])(
    'preserves the cookie on unconfirmed backend failure %s',
    async (status) => {
      handler = (_, res) => sendError(res, 'temporarily_unavailable', status);
      const response = await expire(expired());
      expect(response.status).toBe(503);
      expect(response.headers.get('set-cookie')).toBeNull();
    },
  );

  it('preserves the cookie when backend returns a malformed identity', async () => {
    handler = (_, res) => sendJson(res, {});
    const response = await expire(expired());
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('rejects cleanup Origin, body and query misuse without changing the cookie', async () => {
    const wrongOrigin = expired({ cookie, origin: 'null' });
    const body = new Request(`${origin}/api/auth/expired-session`, {
      method: 'POST',
      headers: { origin, cookie },
      body: '{}',
    });
    const query = new Request(`${origin}/api/auth/expired-session?next=/`, {
      method: 'POST',
      headers: { origin, cookie },
    });
    for (const req of [wrongOrigin, body, query]) {
      const response = await expire(req);
      expect([400, 403]).toContain(response.status);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(requests).toHaveLength(0);
  });
});

describe('SSR direct HTTP transport', () => {
  it('validates the same Me DTO without going through the BFF', async () => {
    const result = await requestBackend({
      operation: 'access.me',
      response: meSchema,
      token: 'server-session',
    });
    expect(result).toEqual({ ok: true, status: 200, data: principal, requestId: 'request-123' });
    expect(requests[0]?.path).toBe('/v1/me');
    expect(requests[0]?.headers.authorization).toBe('Bearer server-session');
  });

  it('keeps 204 empty without parsing JSON', async () => {
    const result = await requestBackend({
      operation: 'identity.logout',
      response: emptyResponseSchema,
      token: 'server-session',
    });
    expect(result).toEqual({ ok: true, status: 204, data: undefined, requestId: '' });
  });

  it('rejects frontend-only and streaming operations from the JSON SSR helper', async () => {
    for (const operation of ['session.expire', 'assets.download', 'assets.writeUpload'] as const) {
      expect(await requestBackend({ operation, response: z.unknown() })).toMatchObject({
        ok: false,
        status: 400,
        uncertain: false,
      });
    }
  });

  it('enforces no-body, missing JSON, idempotency and byte budget before HTTP', async () => {
    const invalid = [
      requestBackend({ operation: 'access.me', body: {}, response: z.unknown() }),
      requestBackend({ operation: 'identity.login', response: z.unknown() }),
      requestBackend({ operation: 'admins.create', body: {}, response: z.unknown() }),
      requestBackend({
        operation: 'admins.create',
        body: {},
        idempotencyKey: 'bad key',
        response: z.unknown(),
      }),
      requestBackend({
        operation: 'identity.login',
        body: {},
        idempotencyKey: 'unpromised',
        response: z.unknown(),
      }),
      requestBackend({
        operation: 'identity.login',
        body: { password: 'x'.repeat(1048576) },
        response: z.unknown(),
      }),
    ];
    expect(
      (await Promise.all(invalid)).every((value) => !value.ok && [400, 413].includes(value.status)),
    ).toBe(true);
    expect(requests).toHaveLength(0);
    expect(
      (
        await requestBackend({
          operation: 'admins.create',
          body: {},
          idempotencyKey: 'intent-0000000001',
          response: z.unknown(),
        })
      ).ok,
    ).toBe(true);
    expect(requests[0]?.headers['idempotency-key']).toBe('intent-0000000001');
  });

  it('does not mark a write as uncertain when cancellation happens before dispatch', async () => {
    const controller = new AbortController();
    controller.abort();
    const response = await requestBackend({
      operation: 'identity.login',
      body: {},
      response: backendLoginSchema,
      signal: controller.signal,
    });
    expect(response).toMatchObject({
      ok: false,
      status: 503,
      error: { code: 'request_cancelled' },
      uncertain: false,
    });
  });
});

describe('lazy server configuration and cookie policy', () => {
  it('validates production HTTPS origin and allows explicit loopback acceptance', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CMS_ADMIN_ORIGIN', 'https://admin.example.com');
    const secure = loadAdminConfig();
    expect(secure.cookieName).toBe('__Host-oneaster-session');
    expect(sessionCookie(secure, 'token', '2100-01-01T00:00:00Z')).toContain('; Secure');
    vi.stubEnv('CMS_ADMIN_ORIGIN', 'http://admin.example.com');
    expect(loadAdminConfig).toThrow('CMS');
    for (const value of ['http://127.0.0.1:3000', 'http://[::1]:3000', 'http://localhost:3000']) {
      vi.stubEnv('CMS_ADMIN_ORIGIN', value);
      expect(loadAdminConfig().secureCookie).toBe(false);
    }
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('CMS_ADMIN_ORIGIN', origin);
  });

  it('rejects production remote HTTP API origins before a bearer can be sent', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CMS_ADMIN_ORIGIN', 'https://admin.example.com');
    vi.stubEnv('CMS_API_BASE_URL', 'http://api.example.com');
    try {
      expect(loadAdminConfig).toThrow('CMS_API_BASE_URL must use HTTPS');
    } finally {
      vi.stubEnv('NODE_ENV', 'test');
      vi.stubEnv('CMS_ADMIN_ORIGIN', origin);
      vi.stubEnv('CMS_API_BASE_URL', fixture.origin);
    }
  });

  it.each([
    'https://admin.example/path',
    'https://user:password@admin.example',
    'https://admin.example?query=1',
    'https://admin.example#hash',
    'file:///tmp/file',
  ])('rejects invalid origin configuration %s', (value) => {
    vi.stubEnv('CMS_ADMIN_ORIGIN', value);
    expect(loadAdminConfig).toThrow('CMS');
    vi.stubEnv('CMS_ADMIN_ORIGIN', origin);
  });

  it('fails closed with missing production configuration and does not clear existing cookie', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('CMS_API_BASE_URL', '');
    expect(loadAdminConfig).toThrow('CMS');
    const response = await GET(request('/v1/me'));
    expect(response.status).toBe(503);
    expect(response.headers.get('set-cookie')).toBeNull();
    vi.stubEnv('CMS_API_BASE_URL', fixture.origin);
    vi.stubEnv('NODE_ENV', 'test');
  });

  it('selects only a single exact host cookie and produces safe deletion attributes', () => {
    const config = loadAdminConfig();
    expect(sessionToken('other=value; oneaster-session=opaque', config)).toBe('opaque');
    expect(sessionToken(null, config)).toBeUndefined();
    expect(sessionToken('oneaster-session=x; oneaster-session=y', config)).toBeUndefined();
    expect(sessionToken('oneaster-session=x%3B', config)).toBeUndefined();
    expect(sessionCookie(config)).toBe(
      'oneaster-session=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0',
    );
  });
});

it('forwards only a valid editor session header and rejects malformed lease identity before contacting the API', async () => {
  const editorId = '11111111-1111-4111-8111-111111111111';
  const response = await handleCmsRequest(
    request('/v1/collections/articles/documents/22222222-2222-4222-8222-222222222222', 'PATCH', {
      body: { revision: 1, data: { title: 'Owned edit' } },
      headers: { 'x-cms-editor-session': editorId, 'x-private-input': 'discard' },
    }),
  );
  expect(response.status).toBe(200);
  expect(requests[0]?.headers['x-cms-editor-session']).toBe(editorId);
  expect(requests[0]?.headers['x-private-input']).toBeUndefined();
  const invalid = await handleCmsRequest(
    request('/v1/collections/articles/documents/22222222-2222-4222-8222-222222222222', 'PATCH', {
      body: { revision: 1, data: {} },
      headers: { 'x-cms-editor-session': 'invalid' },
    }),
  );
  expect(invalid.status).toBe(400);
  expect(requests).toHaveLength(1);
});
