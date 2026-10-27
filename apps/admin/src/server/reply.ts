import 'server-only';
import type { z } from 'zod';
import {
  allowedOperationsSchema,
  meSchema,
  myNavigationSchema,
  resetAcceptedSchema,
} from '../contracts/auth';
import type { OperationDefinition } from '../contracts/operation-definition';
import {
  authorizationDecisionSchema,
  authorizationRequestSchema,
  clientRevocationSchema,
  credentialListSchema,
  keyCreatedSchema,
} from '../contracts/credentials';
import { errorSchema } from '../api/result';
import type { AdminConfig } from './config';
import { backendLoginSchema, sessionCookie } from './session';
import { limitedJson } from './body';
import { TransportError } from './errors';

export function responseHeaders(requestId = ''): Headers {
  const result = new Headers({
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
  });
  if (requestId) result.set('x-request-id', requestId);
  return result;
}

export function jsonReply(
  value: unknown,
  status: number,
  resultHeaders = responseHeaders(),
): Response {
  resultHeaders.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers: resultHeaders });
}

export function problemReply(
  code: string,
  status: number,
  resultHeaders = responseHeaders(),
): Response {
  const requestId = resultHeaders.get('x-request-id') ?? '';
  return jsonReply(
    { error: { code, message: 'The request could not be completed.', requestId } },
    status,
    resultHeaders,
  );
}

function upstreamHeaders(response: Response): Headers {
  const result = responseHeaders(response.headers.get('x-request-id') ?? '');
  const retry = response.headers.get('retry-after');
  if (retry && retry.length <= 128 && (/^\d+$/.test(retry) || Number.isFinite(Date.parse(retry))))
    result.set('retry-after', retry);
  return result;
}

function safeSchema(operation: OperationDefinition): z.ZodType | undefined {
  if (operation.id === 'access.me') return meSchema;
  if (operation.id === 'access.myOperations') return allowedOperationsSchema;
  if (operation.id === 'access.myNavigation') return myNavigationSchema;
  if (operation.id === 'identity.requestPasswordReset') return resetAcceptedSchema;
  if (operation.id === 'credentials.list') return credentialListSchema;
  if (operation.id === 'credentials.createKey') return keyCreatedSchema;
  if (operation.id === 'credentials.revokeClient') return clientRevocationSchema;
  if (operation.id === 'credentials.getAuthorization') return authorizationRequestSchema;
  if (operation.id === 'credentials.decideAuthorization') return authorizationDecisionSchema;
  return undefined;
}

interface ReplyContext {
  operation: OperationDefinition;
  config: AdminConfig;
  method: string;
}

async function errorReply(response: Response, context: ReplyContext): Promise<Response> {
  const result = upstreamHeaders(response);
  let value: unknown;
  try {
    value = await limitedJson(response, context.config.jsonResponseBytes);
  } catch {
    return problemReply('invalid_response', response.status, result);
  }
  const parsed = errorSchema.safeParse(value);
  return parsed.success
    ? jsonReply(parsed.data, response.status, result)
    : problemReply('invalid_response', response.status, result);
}

async function emptyReply(response: Response, context: ReplyContext): Promise<Response> {
  const result = upstreamHeaders(response);
  if (response.status !== 204) {
    await response.body?.cancel();
    return problemReply('invalid_response', 503, result);
  }
  if (context.operation.id === 'identity.changePassword')
    result.set('set-cookie', sessionCookie(context.config));
  return new Response(null, { status: 204, headers: result });
}

function streamReply(response: Response, context: ReplyContext): Response {
  const result = upstreamHeaders(response);
  for (const name of ['content-type', 'content-length', 'etag']) {
    const value = response.headers.get(name);
    if (value !== null) result.set(name, value);
  }
  const disposition = response.headers.get('content-disposition');
  result.set(
    'content-disposition',
    disposition?.startsWith('attachment;') ? disposition : 'attachment',
  );
  return new Response(context.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers: result,
  });
}

function projectedJson(value: unknown, response: Response, context: ReplyContext): Response {
  const result = upstreamHeaders(response);
  if (context.operation.id === 'identity.login') {
    const parsed = backendLoginSchema.safeParse(value);
    if (!parsed.success || Date.parse(parsed.data.expiresAt) <= Date.now())
      return problemReply('invalid_response', 503, result);
    result.set(
      'set-cookie',
      sessionCookie(context.config, parsed.data.token, parsed.data.expiresAt),
    );
    return jsonReply({ expiresAt: parsed.data.expiresAt }, response.status, result);
  }
  const schema = safeSchema(context.operation);
  if (schema) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) return problemReply('invalid_response', 503, result);
    return jsonReply(parsed.data, response.status, result);
  }
  return jsonReply(value, response.status, result);
}

async function jsonBackendReply(response: Response, context: ReplyContext): Promise<Response> {
  const result = upstreamHeaders(response);
  try {
    if (!response.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
      await response.body?.cancel();
      return problemReply('invalid_response', 503, result);
    }
    return projectedJson(
      await limitedJson(response, context.config.jsonResponseBytes),
      response,
      context,
    );
  } catch (error) {
    const code =
      error instanceof TransportError &&
      ['request_timeout', 'request_cancelled'].includes(error.code)
        ? error.code
        : 'invalid_response';
    return problemReply(code, 503, result);
  }
}

export async function backendReply(response: Response, context: ReplyContext): Promise<Response> {
  if (!response.ok) return errorReply(response, context);
  if (context.operation.responseKind === 'empty') return emptyReply(response, context);
  if (context.operation.responseKind === 'stream') return streamReply(response, context);
  return jsonBackendReply(response, context);
}
