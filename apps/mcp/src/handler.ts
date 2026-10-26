import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/server';
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { readBytes } from '@new-cms/api-client/client';
import { createTools } from './tools.ts';
import type { McpConfig } from './config.ts';

const exchangedToken = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().positive(),
});

function metadata(config: McpConfig): Response {
  return Response.json({
    resource: config.resource,
    authorization_servers: [config.apiOrigin],
    scopes_supported: ['cms'],
    bearer_methods_supported: ['header'],
  });
}

function challenge(config: McpConfig): Response {
  const resource = new URL(config.resource);
  const metadataUrl = `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
  return Response.json(
    { error: 'invalid_token' },
    {
      status: 401,
      headers: { 'www-authenticate': `Bearer resource_metadata="${metadataUrl}", scope="cms"` },
    },
  );
}

async function exchange(config: McpConfig, request: Request): Promise<string | null | Response> {
  const authorization = request.headers.get('authorization');
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) return null;
  const response = await fetch(`${config.apiOrigin}/oauth/exchange`, {
    method: 'POST',
    headers: { authorization, 'x-cms-mcp-secret': config.bridgeSecret },
    redirect: 'error',
    signal: request.signal,
  });
  const bytes = await readBytes(response, config.protocolResponseLimitBytes);
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) return null;
    if (response.status === 429) {
      const retry = response.headers.get('retry-after');
      return Response.json(
        { error: 'temporarily_unavailable' },
        { status: 429, headers: retry && /^\d{1,6}$/.test(retry) ? { 'retry-after': retry } : {} },
      );
    }
    throw new Error('API credential exchange failed');
  }
  return exchangedToken.parse(JSON.parse(new TextDecoder().decode(bytes)) as unknown).access_token;
}

function cors(config: McpConfig, request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('origin');
  if (origin && config.allowedOrigins.includes(origin))
    headers.set('access-control-allow-origin', origin);
  headers.set('vary', 'Origin');
  headers.set('access-control-allow-methods', 'POST, OPTIONS');
  headers.set('access-control-allow-headers', allowedHeaders(request).join(', '));
  headers.set(
    'access-control-expose-headers',
    'WWW-Authenticate, MCP-Protocol-Version, Retry-After',
  );
  headers.set('cache-control', 'no-store');
  return new Response(response.body, { status: response.status, headers });
}

export function createMcpApplication(config: McpConfig) {
  const handler = createMcpHandler(
    (context) => {
      const token = context.authInfo?.token;
      if (!token) throw new Error('Missing verified API token');
      return createTools(config, token, context.requestInfo?.signal);
    },
    { legacy: 'reject', responseMode: 'json', maxRequestBodySize: config.bodyLimitBytes },
  );
  return {
    async fetch(request: Request): Promise<Response> {
      try {
        const response = await dispatch(config, request, handler);
        const bytes = await readBytes(response, config.responseLimitBytes);
        return cors(
          config,
          request,
          new Response(bytes.length === 0 ? null : new Uint8Array(bytes), {
            status: response.status,
            headers: response.headers,
          }),
        );
      } catch {
        return cors(
          config,
          request,
          Response.json({ error: 'temporarily_unavailable' }, { status: 503 }),
        );
      }
    },
    close: handler.close,
  };
}

function allowedHeaders(request: Request): string[] {
  const names = [
    'authorization',
    'content-type',
    'mcp-protocol-version',
    'mcp-method',
    'mcp-name',
    'mcp-session-id',
    'last-event-id',
  ];
  const requested = (request.headers.get('access-control-request-headers') ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase());
  return [...names, ...requested.filter((value) => /^mcp-param-[a-z0-9-]+$/.test(value))];
}

async function serve(
  config: McpConfig,
  request: Request,
  options: { token: string; handler: McpHttpHandler },
): Promise<Response> {
  const { token, handler } = options;
  const authInfo = { token, clientId: 'cms-mcp-bridge', scopes: ['cms'] };
  if (!(await isLegacyRequest(request, undefined, { maxRequestBodySize: config.bodyLimitBytes })))
    return handler.fetch(request, { authInfo });
  const server = await createTools(config, token, request.signal);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    maxRequestBodySize: config.bodyLimitBytes,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    await server.close();
  }
}
async function dispatch(
  config: McpConfig,
  request: Request,
  handler: McpHttpHandler,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const origin = request.headers.get('origin');
  if (origin !== null && !config.allowedOrigins.includes(origin))
    return new Response(null, { status: 403 });
  if (request.method === 'OPTIONS') {
    const requested = (request.headers.get('access-control-request-headers') ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean);
    return new Response(null, {
      status: requested.every((value) => allowedHeaders(request).includes(value)) ? 204 : 400,
    });
  }
  if (
    ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp'].includes(
      path,
    ) &&
    request.method === 'GET'
  )
    return metadata(config);
  if (path === '/healthz' && request.method === 'GET') return Response.json({ status: 'ok' });
  if (path === '/readyz' && request.method === 'GET') return readiness(config, request);
  if (path !== '/mcp') return new Response(null, { status: 404 });
  if (request.method !== 'POST')
    return new Response(null, { status: 405, headers: { allow: 'POST, OPTIONS' } });
  return authenticatedRequest(config, request, handler);
}

async function authenticatedRequest(
  config: McpConfig,
  request: Request,
  handler: McpHttpHandler,
): Promise<Response> {
  const token = await exchange(config, request);
  if (token instanceof Response) return token;
  if (!token) return challenge(config);
  return serve(config, request, { token, handler });
}

async function readiness(config: McpConfig, request: Request): Promise<Response> {
  const response = await fetch(`${config.apiOrigin}/readyz`, {
    redirect: 'error',
    signal: request.signal,
  });
  await readBytes(response, config.protocolResponseLimitBytes);
  return Response.json(
    { status: response.ok ? 'ready' : 'unavailable' },
    { status: response.ok ? 200 : 503 },
  );
}
