import type { Context } from 'hono';
import { CmsError } from '@new-cms/cms/platform/contracts';
import type { OperationDefinition, RequestContext } from '@new-cms/cms/platform/contracts';
import { readJson } from './read-json.ts';

export interface HttpEnvironment {
  Bindings: { incoming?: { socket: { remoteAddress?: string } } };
  Variables: { requestId: string; signal: AbortSignal; ip: string };
}

export function requestContext(c: Context<HttpEnvironment>): RequestContext {
  const authorization = c.req.header('authorization');
  const key = c.req.header('idempotency-key');
  return {
    requestId: c.get('requestId'),
    ip: c.get('ip'),
    signal: c.get('signal'),
    ...(authorization?.startsWith('Bearer ') ? { token: authorization.slice(7) } : {}),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  };
}

function queryInput(c: Context<HttpEnvironment>): Record<string, unknown> {
  const result = new Map<string, unknown>();
  for (const [key, values] of Object.entries(c.req.queries())) {
    if (values.length !== 1) throw new CmsError('invalid_input');
    const [value] = values;
    if (['page', 'pageSize', 'version'].includes(key)) {
      if (!value || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
        throw new CmsError('invalid_input');
      result.set(key, Number(value));
    } else result.set(key, value);
  }
  return Object.fromEntries(result);
}

export async function routeInput(c: Context<HttpEnvironment>, maxBytes: number): Promise<unknown> {
  const query = queryInput(c);
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
  let status = 200;
  if (operation.id === 'identity.requestPasswordReset') status = 202;
  else if (operation.method === 'POST' && operation.access === 'security') status = 201;
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
