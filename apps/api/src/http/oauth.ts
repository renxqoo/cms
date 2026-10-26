import type { Hono, Context } from 'hono';
import { CmsError } from '@new-cms/cms/platform/contracts';
import { oauthFailure } from '@new-cms/cms/identity';
import type { OAuthApi } from '@new-cms/cms/identity';
import type { HttpEnvironment } from './contract.ts';
import { requestContext } from './contract.ts';
import { readText } from './read-text.ts';
import { uniqueJson } from './unique-json.ts';

function parameters(values: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of values) {
    if (Object.hasOwn(result, key) || ['__proto__', 'constructor', 'prototype'].includes(key))
      throw new CmsError('invalid_input');
    result[key] = value;
  }
  return result;
}

async function protocolBody(
  c: Context<HttpEnvironment>,
  kind: 'json' | 'form',
  maxBytes: number,
): Promise<unknown> {
  const expected = kind === 'json' ? 'application/json' : 'application/x-www-form-urlencoded';
  if (
    c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() !== expected ||
    c.req.header('content-encoding')
  )
    throw new CmsError('unsupported_media_type');
  const text = await readText(c.req.raw, { signal: c.get('signal'), maxBytes });
  if (kind === 'form') return parameters(new URLSearchParams(text));
  return uniqueJson(text);
}

async function protocolResponse(work: () => Promise<Response>): Promise<Response> {
  try {
    return await work();
  } catch (error) {
    const failure = oauthFailure(error);
    return Response.json(
      { error: failure.error, error_description: failure.error.replaceAll('_', ' ') },
      {
        status: failure.status,
        headers: {
          'cache-control': 'no-store',
          ...(failure.retryAfterSeconds === undefined
            ? {}
            : { 'retry-after': String(failure.retryAfterSeconds) }),
        },
      },
    );
  }
}

export function registerOAuth(app: Hono<HttpEnvironment>, oauth: OAuthApi, maxBytes: number): void {
  app.get('/.well-known/oauth-authorization-server', () =>
    Response.json(oauth.metadata(), { headers: { 'access-control-allow-origin': '*' } }),
  );
  app.get('/oauth/authorize', (c) =>
    protocolResponse(async () => {
      const result = await oauth.authorize(
        requestContext(c),
        parameters(new URL(c.req.url).searchParams),
      );
      return new Response(null, { status: 302, headers: { location: result.redirectTo } });
    }),
  );
  app.post('/oauth/register', (c) =>
    protocolResponse(async () =>
      Response.json(
        await oauth.register(requestContext(c), await protocolBody(c, 'json', maxBytes)),
        { status: 201 },
      ),
    ),
  );
  app.post('/oauth/token', (c) =>
    protocolResponse(async () => {
      if (c.req.header('authorization'))
        return Response.json({ error: 'invalid_client' }, { status: 401 });
      return Response.json(
        await oauth.token(requestContext(c), await protocolBody(c, 'form', maxBytes)),
      );
    }),
  );
  app.post('/oauth/revoke', (c) =>
    protocolResponse(async () => {
      await oauth.revoke(requestContext(c), await protocolBody(c, 'form', maxBytes));
      return new Response(null, { status: 200 });
    }),
  );
  app.post('/oauth/exchange', (c) =>
    protocolResponse(async () =>
      Response.json(
        await oauth.exchange(requestContext(c), {
          token: c.req.header('authorization')?.startsWith('Bearer ')
            ? (c.req.header('authorization')?.slice(7) ?? '')
            : '',
          bridgeSecret: c.req.header('x-cms-mcp-secret') ?? '',
        }),
      ),
    ),
  );
  registerUserInfo(app, oauth);
}

function registerUserInfo(app: Hono<HttpEnvironment>, oauth: OAuthApi): void {
  app.get('/oauth/userinfo', async (c) => {
    const response = await protocolResponse(async () =>
      Response.json(await oauth.userInfo(requestContext(c))),
    );
    if (response.status === 401)
      response.headers.set('www-authenticate', 'Bearer error="invalid_token"');
    return response;
  });
}
