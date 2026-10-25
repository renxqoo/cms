import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { matchedRoutes } from 'hono/route';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { OperationDefinition } from '@new-cms/cms/platform/contracts';
import type { ApplicationConfig } from '../bootstrap/load-config.ts';
import type { HttpEnvironment } from './contract.ts';
import { errorResponse } from './errors.ts';

async function runRequest(
  c: Context<HttpEnvironment>,
  admission: Admission,
  next: () => Promise<void>,
) {
  await admission.admitIp(c.get('ip'));
  await next();
}

export interface Admission {
  admitIp(ip: string): Promise<void>;
}

function validateBoundary(c: Context<HttpEnvironment>, config: ApplicationConfig['http']): void {
  const url = new URL(c.req.url);
  if (!config.allowedHosts.includes(url.hostname)) throw new CmsError('forbidden');
  if (Buffer.byteLength(c.req.url) > config.urlLimitBytes) throw new CmsError('invalid_input');
  const length = c.req.header('content-length');
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > config.bodyLimitBytes)) {
    throw new CmsError('payload_too_large');
  }
  const origin = c.req.header('origin');
  if (origin !== undefined && !config.allowedOrigins.includes(origin))
    throw new CmsError('forbidden');
  if (origin !== undefined) {
    c.header('access-control-allow-origin', origin);
    c.header('vary', 'Origin');
  }
}

function waitForAbort(signal: AbortSignal) {
  let stop: (() => void) | undefined;
  const promise = new Promise<never>((_resolve, reject) => {
    stop = () => reject(new CmsError('temporarily_unavailable'));
    if (signal.aborted) stop();
    else signal.addEventListener('abort', stop, { once: true });
  });
  return {
    promise,
    remove: () => {
      if (stop) signal.removeEventListener('abort', stop);
    },
  };
}

function recordAccess(
  c: Context<HttpEnvironment>,
  startedAt: number,
  operationIds: ReadonlyMap<string, string>,
): void {
  const routes = matchedRoutes(c);
  const responding = routes[c.req.routeIndex];
  const route =
    responding?.method === 'ALL' ? routes.find((matched) => matched.method !== 'ALL') : responding;
  process.stdout.write(
    `${JSON.stringify({
      requestId: c.get('requestId'),
      method: c.req.method,
      operationId: route ? (operationIds.get(`${route.method}:${route.path}`) ?? null) : null,
      path: route?.path ?? null,
      actorId: c.get('actorId') ?? null,
      ip: c.get('ip'),
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    })}\n`,
  );
}

export function requestLifecycle(
  config: ApplicationConfig['http'],
  admission: Admission,
  operations: readonly OperationDefinition[],
): MiddlewareHandler<HttpEnvironment> {
  const operationIds = new Map(
    operations.map((operation) => [`${operation.method}:${operation.path}`, operation.id]),
  );
  let active = 0;
  return async (c, next) => {
    const startedAt = Date.now();
    c.set('requestId', randomUUID());
    c.set('ip', c.env?.incoming?.socket.remoteAddress ?? '127.0.0.1');
    let cleanup: (() => void) | undefined;
    try {
      validateBoundary(c, config);
      if (c.req.path === '/livez' && (c.req.method === 'GET' || c.req.method === 'HEAD')) {
        await next();
        return;
      }
      if (active >= config.maxRequests) throw new CmsError('temporarily_unavailable');
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, c.req.raw.signal]);
      c.set('signal', signal);
      const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
      const aborted = waitForAbort(signal);
      cleanup = () => {
        clearTimeout(timer);
        aborted.remove();
      };
      active += 1;
      const task = runRequest(c, admission, next).finally(() => {
        active -= 1;
      });
      await Promise.race([task, aborted.promise]);
    } catch (error) {
      c.res = errorResponse(error, c.get('requestId'));
    } finally {
      cleanup?.();
      applyResponseHeaders(c, config);
      recordAccess(c, startedAt, operationIds);
    }
  };
}

function applyResponseHeaders(
  c: Context<HttpEnvironment>,
  config: ApplicationConfig['http'],
): void {
  c.res.headers.set('cache-control', 'no-store');
  c.res.headers.set('x-request-id', c.get('requestId'));
  const origin = c.req.header('origin');
  if (origin && config.allowedOrigins.includes(origin)) {
    c.res.headers.set('access-control-allow-origin', origin);
    c.res.headers.set('access-control-expose-headers', 'X-Request-Id,Retry-After');
    c.res.headers.set('vary', 'Origin');
  }
}
