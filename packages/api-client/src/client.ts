import { z } from 'zod';
import { operationFor, validateInput } from './operations.ts';
import type { ApiOperation } from './operations.ts';

export interface ClientOptions {
  origin: string;
  token?: string;
  signal?: AbortSignal;
  timeoutMs: number;
  maxResponseBytes: number;
  maxFileBytes: number;
  fetch?: typeof fetch;
}
export const editorSessionIdSchema = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/,
  );

export interface CallOptions {
  editorSessionId?: string;
  idempotencyKey?: string;
  bytes?: Uint8Array;
  signal?: AbortSignal;
}
export interface Download {
  data: Uint8Array;
  bytes: number;
  filename: string;
  mimeType: string;
}
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  constructor(problem: { status: number; code: string; requestId?: string | null }) {
    super(problem.code);
    this.name = 'ApiError';
    this.status = problem.status;
    this.code = problem.code;
    this.requestId = problem.requestId ?? null;
  }
}

export function apiOrigin(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error('API origin must contain only scheme and authority');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw new Error('API origin requires HTTPS or loopback HTTP');
  return url.origin;
}

function queryValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function operationRequest(operation: ApiOperation, input: Record<string, unknown>) {
  const body = { ...input };
  const path = operation.path.replaceAll(/:([a-zA-Z]+)/g, (_match, key: string) => {
    const value = input[key];
    if (typeof value !== 'string') throw new Error(`Missing path parameter: ${key}`);
    Reflect.deleteProperty(body, key);
    return encodeURIComponent(value);
  });
  if (!['GET', 'DELETE'].includes(operation.method)) return { path, body };
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) query.set(key, queryValue(value));
  }
  return { path: query.size > 0 ? `${path}?${query}` : path };
}

export async function readBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    await response.body?.cancel();
    throw new ApiError({ status: 413, code: 'payload_too_large' });
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) throw new ApiError({ status: 413, code: 'payload_too_large' });
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks, size));
}

const problemSchema = z.object({
  error: z.object({ code: z.string(), requestId: z.string().optional() }),
});

async function checkedResponse(response: Response, maximum: number) {
  const bytes = await readBytes(response, maximum);
  if (response.ok) return bytes;
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    value = null;
  }
  const parsed = problemSchema.safeParse(value);
  throw new ApiError({
    status: response.status,
    code: parsed.success ? parsed.data.error.code : `http_${response.status}`,
    requestId: parsed.success
      ? (parsed.data.error.requestId ?? null)
      : response.headers.get('x-request-id'),
  });
}

function downloadResult(response: Response, data: Uint8Array): Download {
  const disposition = response.headers.get('content-disposition') ?? '';
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  let filename = 'download';
  if (encoded) {
    try {
      filename = decodeURIComponent(encoded);
    } catch {
      filename = 'download';
    }
  }
  return {
    data,
    bytes: data.byteLength,
    filename,
    mimeType: response.headers.get('content-type') ?? 'application/octet-stream',
  };
}

function requestInit(operation: ApiOperation, input: unknown, options: CallOptions): RequestInit {
  const headers = new Headers();
  if (options.editorSessionId !== undefined)
    headers.set(
      'x-cms-editor-session',
      editorSessionIdSchema.parse(options.editorSessionId).toLowerCase(),
    );
  if (operation.idempotency === 'required' && !options.idempotencyKey)
    throw new Error('This operation requires an idempotency key');
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey);
  if (operation.transport === 'upload') {
    if (!options.bytes) throw new Error('Upload bytes are required');
    headers.set('content-type', 'application/octet-stream');
    return { headers, body: new Uint8Array(options.bytes) };
  }
  if (input === undefined) return { headers };
  headers.set('content-type', 'application/json');
  return { headers, body: JSON.stringify(input) };
}

export function createApiClient(options: ClientOptions) {
  const origin = apiOrigin(options.origin);
  const fetcher = options.fetch ?? fetch;
  async function call(id: string, raw: unknown, callOptions: CallOptions = {}): Promise<unknown> {
    const operation = operationFor(id);
    const request = operationRequest(operation, validateInput(id, raw));
    if (callOptions.bytes && callOptions.bytes.byteLength > options.maxFileBytes)
      throw new ApiError({ status: 413, code: 'payload_too_large' });
    const init = requestInit(operation, request.body, callOptions);
    const headers = new Headers(init.headers);
    if (options.token) headers.set('authorization', `Bearer ${options.token}`);
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error('API request timed out')),
      options.timeoutMs,
    );
    const signals = [controller.signal, options.signal, callOptions.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    try {
      const response = await fetcher(`${origin}${request.path}`, {
        ...init,
        method: operation.method,
        headers,
        signal: AbortSignal.any(signals),
        redirect: 'error',
      });
      const maximum =
        operation.transport === 'download' && response.ok
          ? options.maxFileBytes
          : options.maxResponseBytes;
      const bytes = await checkedResponse(response, maximum);
      if (operation.transport === 'download') return downloadResult(response, bytes);
      return bytes.byteLength === 0
        ? null
        : (JSON.parse(new TextDecoder().decode(bytes)) as unknown);
    } finally {
      clearTimeout(timer);
    }
  }
  return { call };
}
