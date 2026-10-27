import 'server-only';
import type { z } from 'zod';
import { acceptsIdempotencyKey, getOperation, operationPath } from '../contracts/operations';
import type { OperationId } from '../contracts/operations';
import type { OperationDefinition } from '../contracts/operation-definition';
import { apiResponse, failure } from '../api/result';
import type { ApiResult } from '../api/result';
import { loadAdminConfig } from './config';
import { fetchBackend } from './transport';
import { TransportError } from './errors';

interface BackendRequest<T> {
  operation: OperationId;
  params?: Readonly<Record<string, string>>;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  response: z.ZodType<T>;
  signal?: AbortSignal;
  idempotencyKey?: string;
  token?: string;
}

function backendBody(
  kind: OperationDefinition['bodyKind'],
  value: unknown,
  maximum: number,
): string | undefined {
  if (kind !== 'json') {
    if (value !== undefined) throw new TransportError('invalid_input', 400);
    return undefined;
  }
  const body = JSON.stringify(value);
  if (body === undefined) throw new TransportError('invalid_input', 400);
  if (new TextEncoder().encode(body).byteLength > maximum)
    throw new TransportError('payload_too_large', 413);
  return body;
}

export async function requestBackend<T>(input: BackendRequest<T>): Promise<ApiResult<T>> {
  if (input.signal?.aborted) return failure('request_cancelled', 503);
  let sent = false;
  let write = false;
  try {
    const operation = getOperation(input.operation);
    write = operation.method !== 'GET';
    if (
      operation.target !== 'backend' ||
      operation.responseKind === 'stream' ||
      operation.bodyKind === 'bytes'
    )
      return failure('invalid_input', 400);
    const path = operationPath(operation, input.params, input.query);
    if (!acceptsIdempotencyKey(operation, input.idempotencyKey))
      return failure('invalid_input', 400);
    const config = loadAdminConfig();
    const body = backendBody(operation.bodyKind, input.body, config.jsonRequestBytes);
    sent = true;
    const response = await fetchBackend({
      operation,
      path,
      config,
      token: input.token,
      body,
      signal: input.signal,
      idempotencyKey: input.idempotencyKey,
    });
    return await apiResponse(response, input.response, write);
  } catch (error) {
    if (error instanceof TransportError)
      return failure(error.code, error.status, { uncertain: sent && write });
    return failure('backend_unavailable', 503, { uncertain: sent && write });
  }
}
