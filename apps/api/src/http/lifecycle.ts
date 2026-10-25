import { randomUUID } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { ApplicationConfig } from '../bootstrap/load-config.ts';
import type { HttpEnvironment } from './contract.ts';
import { errorResponse } from './errors.ts';
import { leaseStream } from './stream-lease.ts';

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

function binaryUpload(c: Context<HttpEnvironment>): boolean {
  return (
    c.req.method === 'PUT' && /^\/v1\/collections\/[^/]+\/uploads\/[^/]+\/content$/.test(c.req.path)
  );
}

function validateBoundary(c: Context<HttpEnvironment>, config: ApplicationConfig['http']): void {
  const url = new URL(c.req.url);
  if (!config.allowedHosts.includes(url.hostname)) throw new CmsError('forbidden');
  if (Buffer.byteLength(c.req.url) > config.urlLimitBytes) throw new CmsError('invalid_input');
  const bodyLimit = binaryUpload(c) ? config.uploadBodyLimitBytes : config.bodyLimitBytes;
  const length = c.req.header('content-length');
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > bodyLimit)) {
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

function recordAccess(c: Context<HttpEnvironment>, startedAt: number): void {
  process.stdout.write(
    `${JSON.stringify({
      requestId: c.get('requestId'),
      method: c.req.method,
      status: c.res.status,
      durationMs: Date.now() - startedAt,
    })}\n`,
  );
}

export function requestLifecycle(
  config: ApplicationConfig['http'],
  admission: Admission,
): MiddlewareHandler<HttpEnvironment> {
  let active = 0;
  return async (c, next) => {
    const startedAt = Date.now();
    c.set('requestId', randomUUID());
    c.set('ip', c.env?.incoming?.socket.remoteAddress ?? '127.0.0.1');
    let cleanup: (() => void) | undefined;
    let streaming = false;
    try {
      validateBoundary(c, config);
      if (active >= config.maxRequests) throw new CmsError('temporarily_unavailable');
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, c.req.raw.signal]);
      c.set('signal', signal);
      const timeoutMs = binaryUpload(c) ? config.uploadTimeoutMs : config.requestTimeoutMs;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const aborted = waitForAbort(signal);
      cleanup = () => {
        clearTimeout(timer);
        aborted.remove();
      };
      active += 1;
      const release = () => {
        active -= 1;
        cleanup?.();
        cleanup = undefined;
      };
      const task = runRequest(c, admission, next).finally(() => {
        if (c.get('streaming') && c.res.body && !signal.aborted) {
          streaming = true;
          c.res = new Response(leaseStream(c.res.body, { signal, finish: release }), c.res);
        } else release();
      });
      await Promise.race([task, aborted.promise]);
    } catch (error) {
      c.res = errorResponse(error, c.get('requestId'));
    } finally {
      if (!streaming) cleanup?.();
      finalizeResponse(c, config, startedAt);
    }
  };
}

function finalizeResponse(
  c: Context<HttpEnvironment>,
  config: ApplicationConfig['http'],
  startedAt: number,
): void {
  c.res.headers.set('cache-control', 'no-store');
  c.res.headers.set('x-request-id', c.get('requestId'));
  const origin = c.req.header('origin');
  if (origin && config.allowedOrigins.includes(origin)) {
    c.res.headers.set('access-control-allow-origin', origin);
    c.res.headers.set('access-control-expose-headers', 'X-Request-Id,Retry-After');
    c.res.headers.set('vary', 'Origin');
  }
  recordAccess(c, startedAt);
}
