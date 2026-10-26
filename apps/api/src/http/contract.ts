import type { Context } from 'hono';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { OperationDefinition, RequestContext } from '@new-cms/cms/platform/contracts';
import { readJson } from './read-json.ts';

export interface HttpEnvironment {
  Bindings: { incoming?: { socket: { remoteAddress?: string } } };
  Variables: {
    requestId: string;
    signal: AbortSignal;
    ip: string;
    streaming?: boolean;
    traffic: 'administration' | 'public-content';
    actorId?: string;
    credentialId?: string;
  };
}

export function requestContext(c: Context<HttpEnvironment>): RequestContext {
  const authorization = c.req.header('authorization');
  const key = c.req.header('idempotency-key');
  return {
    requestId: c.get('requestId'),
    ip: c.get('ip'),
    signal: c.get('signal'),
    onAuthenticated: (adminId) => c.set('actorId', adminId),
    onCredential: (credentialId) => c.set('credentialId', credentialId),
    ...(authorization?.startsWith('Bearer ') ? { token: authorization.slice(7) } : {}),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  };
}

function queryValue(key: string, value: string | undefined): unknown {
  if (['page', 'pageSize', 'version', 'revision', 'depth'].includes(key)) {
    const pattern = key === 'depth' ? /^(0|[1-9]\d*)$/ : /^[1-9]\d*$/;
    if (!value || !pattern.test(value) || !Number.isSafeInteger(Number(value)))
      throw new CmsError('invalid_input');
    return Number(value);
  }
  if (key === 'trashed' || key === 'blocked') {
    if (value !== 'true' && value !== 'false') throw new CmsError('invalid_input');
    return value === 'true';
  }
  if (key === 'folderId' && value === 'null') return null;
  if (['where', 'sort', 'select', 'fallback'].includes(key)) {
    try {
      return JSON.parse(value ?? '') as unknown;
    } catch {
      throw new CmsError('invalid_input');
    }
  }
  return value;
}

function queryInput(
  c: Context<HttpEnvironment>,
  versionedDelete: boolean,
): Record<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [key, values] of Object.entries(c.req.queries())) {
    if (values.length !== 1) throw queryProblem(key, versionedDelete);
    try {
      result.set(key, queryValue(key, values[0]));
    } catch {
      throw queryProblem(key, versionedDelete);
    }
  }
  if (versionedDelete && !result.has('version')) throw queryProblem('version', true);
  return Object.fromEntries(result);
}

function queryProblem(key: string, versionedDelete: boolean): CmsError {
  return new CmsError(
    'invalid_input',
    key === 'version' && versionedDelete
      ? {
          fieldErrors: [
            {
              field: 'version',
              message:
                'Send one positive integer query parameter ?version=N. DELETE request bodies are not read.',
            },
          ],
        }
      : {},
  );
}

export async function routeInput(
  c: Context<HttpEnvironment>,
  maxBytes: number,
  versionedDelete = false,
): Promise<unknown> {
  const query = queryInput(c, versionedDelete);
  const params: Record<string, string> = c.req.param();
  if (Object.keys(params).some((key) => Object.hasOwn(query, key)))
    throw new CmsError('invalid_input');
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'DELETE') {
    return { ...query, ...params };
  }
  if (Object.keys(query).length > 0) throw new CmsError('invalid_input');
  if (c.req.path === '/v1/auth/logout') return {};
  const contentType = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') throw new CmsError('unsupported_media_type');
  const body = await readJson(c.req.raw, { signal: c.get('signal'), maxBytes });
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new CmsError('invalid_input');
  }
  if (Object.keys(params).some((key) => key in body)) throw new CmsError('invalid_input');
  return { ...body, ...params };
}

export function successResponse(operation: OperationDefinition, value: unknown): Response {
  if (value === undefined) return new Response(null, { status: 204 });
  let status = operation.successStatus ?? 200;
  if (
    operation.id === 'content.batch' &&
    value !== null &&
    typeof value === 'object' &&
    'status' in value &&
    (value.status === 'queued' || value.status === 'running')
  )
    status = 202;
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
