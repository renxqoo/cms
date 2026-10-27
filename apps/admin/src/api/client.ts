import type { z } from 'zod';
import { acceptsIdempotencyKey, getOperation, operationPath } from '../contracts/operations';
import type { OperationId } from '../contracts/operations';
import type { OperationDefinition } from '../contracts/operation-definition';
import { apiResponse, failure } from './result';
import type { ApiResult } from './result';
import { requestPolicy } from './config';
import { downloadResponse } from './download';
import { uploadBytes } from './upload-transport';
import type { UploadProgress } from './upload-transport';

export type { ApiResult } from './result';
export type { UploadProgress } from './upload-transport';

interface ApiRequest<T> {
  operation: OperationId;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  response: z.ZodType<T>;
  signal: AbortSignal;
  idempotencyKey?: string;
  editorSessionId?: string;
  keepalive?: boolean;
  onUploadProgress?: (progress: UploadProgress) => void;
}

function requestBody(operation: OperationDefinition, body: unknown): BodyInit | null {
  if (operation.bodyKind === 'none') {
    if (body !== undefined) throw new Error('Invalid body');
    return null;
  }
  if (operation.bodyKind === 'bytes') {
    if (!(body instanceof Blob) && !(body instanceof ArrayBuffer)) throw new Error('Invalid bytes');
    return body;
  }
  const encoded = JSON.stringify(body);
  if (encoded === undefined) throw new Error('Missing JSON body');
  return encoded;
}

function preparedRequest<T>(operation: OperationDefinition, input: ApiRequest<T>): RequestInit {
  if (
    input.onUploadProgress !== undefined &&
    (operation.bodyKind !== 'bytes' || typeof XMLHttpRequest === 'undefined')
  )
    throw new Error('Invalid progress request');
  const headers = new Headers();
  if (input.editorSessionId !== undefined) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        input.editorSessionId,
      )
    )
      throw new Error('Invalid editor session');
    headers.set('x-cms-editor-session', input.editorSessionId);
  }
  if (!acceptsIdempotencyKey(operation, input.idempotencyKey))
    throw new Error('Invalid idempotency');
  if (input.idempotencyKey !== undefined) headers.set('idempotency-key', input.idempotencyKey);
  const body = requestBody(operation, input.body);
  if (operation.bodyKind === 'json') headers.set('content-type', 'application/json');
  if (operation.bodyKind === 'bytes') headers.set('content-type', 'application/octet-stream');
  return {
    method: operation.method,
    headers,
    body,
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    ...(input.keepalive ? { keepalive: true } : {}),
  };
}

function dispatchRequest(
  context: { operation: OperationDefinition; path: string; init: RequestInit },
  signal: AbortSignal,
  onProgress: ApiRequest<unknown>['onUploadProgress'],
) {
  const { operation, path, init } = context;
  const url = operation.target === 'frontend' ? path : `/api/cms${path}`;
  return onProgress !== undefined && (init.body instanceof Blob || init.body instanceof ArrayBuffer)
    ? uploadBytes({
        url,
        method: operation.method,
        headers: new Headers(init.headers),
        body: init.body,
        signal,
        onProgress,
      })
    : fetch(url, { ...init, signal });
}

function exceedsBudget(body: BodyInit | null | undefined, operation: OperationDefinition): boolean {
  const maximum =
    operation.bodyKind === 'bytes' ? requestPolicy.byteLimit : requestPolicy.jsonRequestBytes;
  if (typeof body === 'string') return new TextEncoder().encode(body).byteLength > maximum;
  if (body instanceof Blob) return body.size > maximum;
  if (body instanceof ArrayBuffer) return body.byteLength > maximum;
  return false;
}

function failureCode(cancelled: boolean, timedOut: boolean, sent: boolean): string {
  if (cancelled) return 'request_cancelled';
  if (timedOut) return 'request_timeout';
  return sent ? 'request_failed' : 'invalid_input';
}

export async function requestApi<T>(input: ApiRequest<T>): Promise<ApiResult<T>> {
  let sent = false;
  let write = false;
  let timedOut = false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  function cancel() {
    controller.abort();
  }
  input.signal.addEventListener('abort', cancel, { once: true });
  try {
    const operation = getOperation(input.operation);
    write = operation.method !== 'GET';
    const path = operationPath(operation, input.params, input.query);
    if (input.signal.aborted) return failure('request_cancelled', 0);
    const init = preparedRequest(operation, input);
    if (exceedsBudget(init.body, operation)) return failure('payload_too_large', 413);
    timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      operation.bodyKind === 'bytes' || operation.responseKind === 'stream'
        ? requestPolicy.streamTimeoutMs
        : requestPolicy.requestTimeoutMs,
    );
    sent = true;
    const response = await dispatchRequest(
      { operation, path, init },
      controller.signal,
      input.onUploadProgress,
    );
    return operation.responseKind === 'stream'
      ? await downloadResponse(response, input.response)
      : await apiResponse(response, input.response, write);
  } catch {
    return failure(failureCode(input.signal.aborted, timedOut, sent), sent ? 0 : 400, {
      uncertain: sent && write,
    });
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener('abort', cancel);
  }
}
