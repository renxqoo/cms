import 'server-only';
import { meSchema } from '../contracts/auth';
import { acceptsIdempotencyKey, matchOperation } from '../contracts/operations';
import type { OperationDefinition } from '../contracts/operations';
import { errorSchema } from '../api/result';
import { loadAdminConfig } from './config';
import type { AdminConfig } from './config';
import { sessionCookie, sessionToken } from './session';
import { fetchBackend, requestLifetime } from './transport';
import type { RequestLifetime } from './transport';
import { assertBodyLength, assertEmptyBody, discardRequestBody, limitedJson } from './body';
import { TransportError } from './errors';
import { backendReply, problemReply, responseHeaders } from './reply';

interface RequestContext {
  operation: OperationDefinition;
  config: AdminConfig;
  url: URL;
}

function checkOrigin(request: Request, config: AdminConfig): void {
  if (
    !['GET', 'HEAD'].includes(request.method) &&
    request.headers.get('origin') !== config.adminOrigin
  )
    throw new TransportError('invalid_origin', 403);
}

function checkQuery(url: URL, operation: OperationDefinition): void {
  const seen = new Set<string>();
  for (const [key] of url.searchParams) {
    if (!operation.queryKeys.includes(key) || seen.has(key))
      throw new TransportError('invalid_input', 400);
    seen.add(key);
  }
}

function idempotency(request: Request, operation: OperationDefinition): string | undefined {
  const key = request.headers.get('idempotency-key');
  if (!acceptsIdempotencyKey(operation, key ?? undefined))
    throw new TransportError('invalid_input', 400);
  return key ?? undefined;
}

function rawBody(request: Request, config: AdminConfig): ReadableStream<Uint8Array> {
  assertBodyLength(request.headers, config.byteLimit);
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !==
    'application/octet-stream'
  )
    throw new TransportError('unsupported_media_type', 415);
  if (request.body === null) throw new TransportError('invalid_input', 400);
  return request.body;
}

async function requestBody(
  request: Request,
  context: RequestContext,
  lifetime: RequestLifetime,
): Promise<string | ReadableStream<Uint8Array> | undefined> {
  if (context.operation.bodyKind === 'none') {
    await assertEmptyBody(request, lifetime.signal);
    return undefined;
  }
  const encoding = request.headers.get('content-encoding');
  if (encoding !== null && encoding !== 'identity')
    throw new TransportError('unsupported_media_type', 415);
  if (context.operation.bodyKind === 'bytes') return rawBody(request, context.config);
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new TransportError('unsupported_media_type', 415);
  const value = await limitedJson(request, context.config.jsonRequestBytes, lifetime.signal);
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TransportError('invalid_input', 400);
  return JSON.stringify(value);
}

async function forwardRequest(request: Request, context: RequestContext): Promise<Response> {
  const { operation, config, url } = context;
  checkQuery(url, operation);
  const key = idempotency(request, operation);
  const token =
    operation.access === 'protected'
      ? sessionToken(request.headers.get('cookie'), config)
      : undefined;
  if (operation.access === 'protected' && !token) {
    const result = responseHeaders();
    return problemReply('unauthenticated', 401, result);
  }
  const streaming = operation.bodyKind === 'bytes' || operation.responseKind === 'stream';
  const lifetime = requestLifetime(
    request.signal,
    streaming ? config.streamTimeoutMs : config.requestTimeoutMs,
  );
  try {
    const body = await requestBody(request, context, lifetime);
    const backend = await fetchBackend({
      operation,
      path: `${url.pathname.slice('/api/cms'.length)}${url.search}`,
      config,
      token,
      body,
      idempotencyKey: key,
      method: request.method,
      lifetime,
    });
    return await backendReply(backend, { operation, config, method: request.method });
  } catch (error) {
    lifetime.close();
    lifetime.abort(error);
    throw error;
  }
}

function failureReply(error: unknown): Response {
  if (error instanceof TransportError) return problemReply(error.code, error.status);
  return problemReply('backend_unavailable', 503);
}

function requestContext(request: Request): RequestContext {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/cms/')) throw new TransportError('not_found', 404);
  const matched = matchOperation(request.method, url.pathname.slice('/api/cms'.length));
  if (!matched) throw new TransportError('not_found', 404);
  const config = loadAdminConfig();
  checkOrigin(request, config);
  return { operation: matched.operation, config, url };
}

async function executeCmsRequest(request: Request): Promise<Response> {
  let context: RequestContext;
  try {
    context = requestContext(request);
  } catch (error) {
    return failureReply(error);
  }
  let response: Response;
  try {
    response = await forwardRequest(request, context);
  } catch (error) {
    response = failureReply(error);
  }
  if (context.operation.id === 'identity.logout')
    response.headers.set('set-cookie', sessionCookie(context.config));
  return response;
}

export async function handleCmsRequest(request: Request): Promise<Response> {
  try {
    return await executeCmsRequest(request);
  } finally {
    await discardRequestBody(request);
  }
}

async function expiredReply(response: Response, config: AdminConfig): Promise<Response> {
  const result = responseHeaders();
  if (response.status === 401) {
    const value = errorSchema.safeParse(await limitedJson(response, config.jsonResponseBytes));
    if (value.success && value.data.error.code === 'unauthenticated') {
      return new Response(null, { status: 204, headers: result });
    }
    return problemReply('backend_unavailable', 503, result);
  }
  if (response.ok) {
    const me = meSchema.safeParse(await limitedJson(response, config.jsonResponseBytes));
    return me.success
      ? problemReply('session_changed', 409, result)
      : problemReply('invalid_response', 503, result);
  }
  await response.body?.cancel();
  return problemReply('backend_unavailable', 503, result);
}

export async function handleExpiredSession(request: Request): Promise<Response> {
  let lifetime: RequestLifetime | undefined;
  try {
    const config = loadAdminConfig();
    checkOrigin(request, config);
    if (request.method !== 'POST' || new URL(request.url).search)
      return problemReply('invalid_input', 400);
    lifetime = requestLifetime(request.signal, config.requestTimeoutMs);
    await assertEmptyBody(request, lifetime.signal);
    const token = sessionToken(request.headers.get('cookie'), config);
    if (!token) {
      const result = responseHeaders();
      return new Response(null, { status: 204, headers: result });
    }
    const matched = matchOperation('GET', '/v1/me');
    if (!matched) return problemReply('backend_unavailable', 503);
    const response = await fetchBackend({
      operation: matched.operation,
      path: '/v1/me',
      config,
      token,
      lifetime,
    });
    return await expiredReply(response, config);
  } catch (error) {
    return failureReply(error);
  } finally {
    lifetime?.close();
    await discardRequestBody(request);
  }
}
