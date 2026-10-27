import 'server-only';
import type { OperationDefinition } from '../contracts/operation-definition';
import type { AdminConfig } from './config';
import { TransportError } from './errors';
import { assertBodyLength } from './body';
import { limitedStream } from './streams';

export function requestLifetime(signal: AbortSignal | undefined, milliseconds: number) {
  const controller = new AbortController();
  let timedOut = false;
  function cancel() {
    controller.abort(new TransportError('request_cancelled', 503));
  }
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new TransportError('request_timeout', 503));
  }, milliseconds);
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  function close() {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
  return {
    signal: controller.signal,
    close,
    abort: (error: unknown) => controller.abort(error),
    timedOut: () => timedOut,
  };
}

export type RequestLifetime = ReturnType<typeof requestLifetime>;

interface BackendRequest {
  operation: OperationDefinition;
  path: string;
  config: AdminConfig;
  token?: string | undefined;
  body?: string | ReadableStream<Uint8Array> | undefined;
  signal?: AbortSignal | undefined;
  idempotencyKey?: string | undefined;
  editorSessionId?: string | undefined;
  method?: string;
  lifetime?: RequestLifetime;
}

function backendInit(
  input: BackendRequest,
  lifetime: RequestLifetime,
): RequestInit & { duplex?: 'half' } {
  const headers = new Headers();
  if (input.token !== undefined) headers.set('authorization', `Bearer ${input.token}`);
  if (input.idempotencyKey !== undefined) headers.set('idempotency-key', input.idempotencyKey);
  if (input.editorSessionId !== undefined)
    headers.set('x-cms-editor-session', input.editorSessionId);
  if (input.operation.bodyKind === 'json') headers.set('content-type', 'application/json');
  if (input.operation.bodyKind === 'bytes') headers.set('content-type', 'application/octet-stream');
  const upload = input.body instanceof ReadableStream;
  const body =
    input.body instanceof ReadableStream
      ? limitedStream(input.body, {
          maximum: input.config.byteLimit,
          highWaterMark: input.config.streamHighWaterMark,
          signal: lifetime.signal,
          finish: () => {},
          fail: lifetime.abort,
        })
      : input.body;
  return {
    method: input.method ?? input.operation.method,
    headers,
    body: body ?? null,
    cache: 'no-store',
    redirect: 'error',
    signal: lifetime.signal,
    ...(upload ? { duplex: 'half' as const } : {}),
  };
}

async function backendResponse(
  response: Response,
  input: BackendRequest,
  lifetime: RequestLifetime,
): Promise<Response> {
  if (!response.body) {
    lifetime.close();
    lifetime.abort(new TransportError('request_complete', 503));
    return response;
  }
  const maximum =
    response.ok && input.operation.responseKind === 'stream'
      ? input.config.byteLimit
      : input.config.jsonResponseBytes;
  try {
    assertBodyLength(response.headers, maximum);
  } catch {
    await response.body.cancel();
    throw new TransportError('invalid_response', 503);
  }
  const stream = limitedStream(response.body, {
    maximum,
    highWaterMark: input.config.streamHighWaterMark,
    signal: lifetime.signal,
    finish() {
      lifetime.close();
      lifetime.abort(new TransportError('request_complete', 503));
    },
    fail: lifetime.abort,
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function transportFailure(
  error: unknown,
  input: BackendRequest,
  lifetime: RequestLifetime,
): TransportError {
  if (error instanceof TransportError) return error;
  if (input.signal?.aborted) return new TransportError('request_cancelled', 503);
  if (lifetime.timedOut()) return new TransportError('request_timeout', 503);
  return new TransportError('backend_unavailable', 503);
}

export async function fetchBackend(input: BackendRequest): Promise<Response> {
  const streaming =
    input.operation.bodyKind === 'bytes' || input.operation.responseKind === 'stream';
  const lifetime =
    input.lifetime ??
    requestLifetime(
      input.signal,
      streaming ? input.config.streamTimeoutMs : input.config.requestTimeoutMs,
    );
  try {
    const response = await fetch(
      new URL(input.path, input.config.apiBaseUrl),
      backendInit(input, lifetime),
    );
    return await backendResponse(response, input, lifetime);
  } catch (error) {
    lifetime.close();
    lifetime.abort(error);
    throw transportFailure(error, input, lifetime);
  }
}
