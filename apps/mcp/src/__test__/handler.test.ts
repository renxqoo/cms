import { z } from 'zod';
import { afterEach, expect, it, vi } from 'vitest';
import { createMcpApplication } from '../handler.ts';
import { loadMcpConfig } from '../config.ts';
import { decodeBase64 } from '../tools.ts';
import { operations } from '@new-cms/api-client/operations';

const config = loadMcpConfig({
  CMS_API_ORIGIN: 'https://api.example',
  CMS_MCP_RESOURCE: 'https://mcp.example/mcp',
  CMS_MCP_BRIDGE_SECRET: 's'.repeat(32),
  MCP_ALLOWED_ORIGINS: 'https://admin.example',
});
const apps: ReturnType<typeof createMcpApplication>[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) await app.close();
  vi.unstubAllGlobals();
});
function application() {
  const app = createMcpApplication(config);
  apps.push(app);
  return app;
}
function apiFixture(grants = ['documents.list']) {
  const calls: { path: string; headers: Headers; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((url, init) => {
      const path = new URL(new Request(url ?? 'https://invalid.example').url).pathname;
      calls.push({ path, headers: new Headers(init?.headers), body: init?.body });
      if (path === '/oauth/exchange')
        return Promise.resolve(
          Response.json({ access_token: 'exchanged', token_type: 'Bearer', expires_in: 60 }),
        );
      if (path === '/v1/me/operations')
        return Promise.resolve(
          Response.json({
            rows: grants.map((operationId) => ({ operationId })),
            total: grants.length,
          }),
        );
      if (path.endsWith('/file'))
        return Promise.resolve(
          new Response(new Uint8Array([0, 255, 128]), { headers: { 'content-type': 'image/png' } }),
        );
      return Promise.resolve(
        Response.json({ error: { code: 'forbidden', requestId: 'r-forbidden' } }, { status: 403 }),
      );
    }),
  );
  return calls;
}
async function message(
  app: ReturnType<typeof application>,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.fetch(
    new Request(config.resource, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer input-key',
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}
async function json(response: Response): Promise<unknown> {
  const text = await response.text();
  const payload = text.startsWith('event:')
    ? text
        .split('\n')
        .find((line) => line.startsWith('data:'))
        ?.slice(5)
    : text;
  return JSON.parse(payload ?? '') as unknown;
}

it('publishes public protected resource discovery with only cms and a WWW-Authenticate challenge', async () => {
  const app = application();
  const metadata = await app.fetch(
    new Request('https://mcp.example/.well-known/oauth-protected-resource/mcp'),
  );
  expect(await metadata.json()).toEqual({
    resource: config.resource,
    authorization_servers: ['https://api.example'],
    scopes_supported: ['cms'],
    bearer_methods_supported: ['header'],
  });
  const unauthorized = await app.fetch(new Request(config.resource, { method: 'POST' }));
  expect(unauthorized.status).toBe(401);
  expect(unauthorized.headers.get('www-authenticate')).toContain(
    'resource_metadata="https://mcp.example/.well-known/oauth-protected-resource/mcp"',
  );
  expect(unauthorized.headers.get('www-authenticate')).not.toContain('offline_access');
});

it('rejects unlisted Origin, supports preflight and exposes discovery headers', async () => {
  const app = application();
  expect(
    (
      await app.fetch(
        new Request(config.resource, {
          method: 'OPTIONS',
          headers: { origin: 'https://evil.example' },
        }),
      )
    ).status,
  ).toBe(403);
  const preflight = await app.fetch(
    new Request(config.resource, {
      method: 'OPTIONS',
      headers: { origin: 'https://admin.example' },
    }),
  );
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-origin')).toBe('https://admin.example');
  expect(preflight.headers.get('access-control-allow-headers')).toContain('mcp-protocol-version');
  expect(preflight.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
  expect((await app.fetch(new Request(config.resource))).status).toBe(405);
  expect((await app.fetch(new Request('https://mcp.example/missing'))).status).toBe(404);
});

it('serves legacy initialize and lists only authorized business tools with one bridge token per request', async () => {
  const calls = apiFixture();
  const app = application();
  const initialized = await message(app, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'test', version: '1' },
    },
  });
  expect(await json(initialized)).toMatchObject({ result: { protocolVersion: '2025-11-25' } });
  const listed = await message(
    app,
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
    { 'mcp-protocol-version': '2025-11-25' },
  );
  const listedNames = names(await json(listed));
  expect(listedNames).toContain('documents_list');
  expect(listedNames).toContain('access_me');
  expect(listedNames).not.toContain('admins_create');
  const bridgeCalls = calls.filter((call) => call.path === '/oauth/exchange');
  expect(bridgeCalls).toHaveLength(2);
  expect(bridgeCalls[0]?.headers.get('authorization')).toBe('Bearer input-key');
  expect(bridgeCalls[0]?.headers.get('x-cms-mcp-secret')).toBe(config.bridgeSecret);
  expect(
    calls
      .filter((call) => call.path === '/v1/me/operations')
      .every((call) => call.headers.get('authorization') === 'Bearer exchanged'),
  ).toBe(true);
});

it('supports modern per-request metadata through the same factory', async () => {
  apiFixture();
  const response = await message(
    application(),
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': { name: 'test', version: '1' },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    },
    { 'mcp-protocol-version': '2026-07-28', 'mcp-method': 'tools/list' },
  );
  const payload = await json(response);
  expect({ status: response.status, payload }).toMatchObject({ status: 200 });
  expect(names(payload)).toContain('documents_list');
});

it('never exposes public content or preview endpoints as tools even when discovery grants list them', async () => {
  const publicOperations = operations.filter(
    (operation) =>
      operation.access === 'public' &&
      (operation.id.startsWith('publicContent.') || operation.id.startsWith('previewContent.')),
  );
  expect(publicOperations).toHaveLength(14);
  apiFixture(['documents.list', ...publicOperations.map((operation) => operation.id)]);
  const response = await message(application(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });
  const listed = names(await json(response));
  expect(listed).toContain('documents_list');
  for (const operation of publicOperations) expect(listed).not.toContain(operation.tool);
});

it('turns API permission failures into structured tool errors and puts downloaded bytes only in structuredContent', async () => {
  apiFixture(['assets.download']);
  const app = application();
  const errorResponse = await message(app, {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'access_me', arguments: {} },
  });
  expect(await json(errorResponse)).toMatchObject({
    result: {
      isError: true,
      structuredContent: { error: { code: 'forbidden', requestId: 'r-forbidden', status: 403 } },
    },
  });
  const file = await message(app, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'assets_download',
      arguments: { collection: 'media', id: '11111111-1111-4111-8111-111111111111' },
    },
  });
  const payload = await json(file);
  expect(payload).toMatchObject({
    result: {
      content: [{ type: 'text', text: '{"bytes":3,"filename":"download","mimeType":"image/png"}' }],
      structuredContent: { encoding: 'base64', data: 'AP+A', bytes: 3 },
    },
  });
  expect(JSON.stringify(payload).match(/AP\+A/g)).toHaveLength(1);
});

it('rejects invalid base64 padding, noncanonical encoding, paths and oversize content', () => {
  expect(decodeBase64('AP+A', 3)).toEqual(new Uint8Array([0, 255, 128]));
  expect(decodeBase64('', 0)).toEqual(new Uint8Array());
  for (const input of ['AB==', 'AP+A\n', '/etc/passwd', 'https://evil.example', 'A===', 'AP+A='])
    expect(() => decodeBase64(input, 100)).toThrow(Error);
  expect(() => decodeBase64('AP+A', 2)).toThrow(Error);
});

function names(value: unknown): string[] {
  return z
    .object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) })
    .parse(value)
    .result.tools.map((tool) => tool.name);
}

it('builds union and idempotency schemas, rejects unknown tools and refuses path-based uploads', async () => {
  apiFixture(['assets.writeUpload', 'documents.create']);
  const app = application();
  const listed = await message(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  expect(names(await json(listed))).toContain('documents_create');
  const upload = await message(app, {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'assets_writeUpload',
      arguments: {
        collection: 'media',
        uploadId: '11111111-1111-4111-8111-111111111111',
        base64: '/etc/passwd',
      },
    },
  });
  expect(await json(upload)).toMatchObject({
    result: { isError: true, structuredContent: { error: { code: 'invalid_input' } } },
  });
  const unknown = await message(app, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'arbitrary_local_path', arguments: {} },
  });
  expect(await json(unknown)).toMatchObject({ error: { code: -32602 } });
});

it('rejects invalid bridge credentials and fails closed on an unavailable upstream', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 })),
  );
  const app = application();
  expect((await message(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(401);
  expect((await message(app, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).status).toBe(503);
});

it('fails closed rather than publishing partial tools when the allowed operation page budget is exhausted', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>().mockImplementation((url) => {
      if (new Request(url).url.endsWith('/oauth/exchange'))
        return Promise.resolve(
          Response.json({ access_token: 'valid', token_type: 'Bearer', expires_in: 60 }),
        );
      return Promise.resolve(
        Response.json({ rows: [{ operationId: 'documents.list' }], total: 1000 }),
      );
    }),
  );
  const app = createMcpApplication({ ...config, operationPageLimit: 1 });
  apps.push(app);
  expect((await message(app, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status).toBe(503);
});

it('allows all validated MCP parameter headers in browser preflight and rejects unrelated headers', async () => {
  const app = application();
  const preflight = await app.fetch(
    new Request(config.resource, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://admin.example',
        'access-control-request-headers': 'Authorization, Mcp-Param-Upload-Id',
      },
    }),
  );
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get('access-control-allow-headers')).toContain('mcp-param-upload-id');
  const rejected = await app.fetch(
    new Request(config.resource, {
      method: 'OPTIONS',
      headers: { 'access-control-request-headers': 'x-forwarded-for' },
    }),
  );
  expect(rejected.status).toBe(400);
});

it('ties readiness to the API database contract check rather than process health', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ status: 'ready' }))
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  const app = application();
  expect((await app.fetch(new Request('https://mcp.example/readyz'))).status).toBe(200);
  expect((await app.fetch(new Request('https://mcp.example/readyz'))).status).toBe(503);
  expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example/readyz');
});

it('preserves shared account rate rejection and retry timing instead of reporting an upstream outage', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json(
          { error: 'temporarily_unavailable' },
          { status: 429, headers: { 'retry-after': '42' } },
        ),
      ),
  );
  const result = await message(application(), { jsonrpc: '2.0', id: 1, method: 'tools/list' });
  expect(result.status).toBe(429);
  expect(result.headers.get('retry-after')).toBe('42');
  expect(await result.json()).toMatchObject({ error: 'temporarily_unavailable' });
});
it('regression: MCP editorSessionId is optional tool context and is forwarded as an editor header after argument stripping', async () => {
  const calls = apiFixture(['documents.update']);
  const editorSessionId = 'ABCDEFAB-1234-4123-8123-ABCDEFABCDEF';
  const response = await message(application(), {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'documents_update',
      arguments: {
        collection: 'articles',
        id: '11111111-1111-4111-8111-111111111111',
        revision: 1,
        data: { title: 'Editor' },
        editorSessionId,
      },
    },
  });
  expect(await json(response)).toMatchObject({
    result: { isError: true, structuredContent: { error: { code: 'forbidden', status: 403 } } },
  });
  const call = calls.find((value) =>
    value.path.endsWith('/documents/11111111-1111-4111-8111-111111111111'),
  );
  expect(call?.headers.get('x-cms-editor-session')).toBe(editorSessionId.toLowerCase());
  expect(JSON.parse(String(call?.body)) as unknown).toEqual({
    revision: 1,
    data: { title: 'Editor' },
  });
  for (const editor of ['invalid', '00000000-0000-0000-0000-000000000000']) {
    const invalid = await message(application(), {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'documents_update',
        arguments: {
          collection: 'articles',
          id: '11111111-1111-4111-8111-111111111111',
          revision: 1,
          data: { title: 'Editor' },
          editorSessionId: editor,
        },
      },
    });
    expect(await json(invalid)).toMatchObject({ result: { isError: true } });
  }
  expect(
    calls.filter((value) => value.path.endsWith('/documents/11111111-1111-4111-8111-111111111111')),
  ).toHaveLength(1);
});
