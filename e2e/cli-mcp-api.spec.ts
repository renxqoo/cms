import { afterEach, expect, it } from 'vitest';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createCmsProcess } from '../test/support/cms-process.ts';
import { bindOperations, contentDocument } from '../test/support/cms-api.ts';
import type { ApiClient, ApiOptions } from '../test/support/cms-api.ts';
import { extractToken } from '../test/support/smtp.ts';
import { startCliProcess, runCliProcess } from '../test/support/cli-process.ts';
import { availablePort } from '../test/support/tcp-port.ts';
import { nodeExecutable } from '../test/support/node-runtime.ts';
import { startProcess } from '../test/support/process.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close();
});
const bridgeSecret = 'real-pg-cli-mcp-process-bridge-secret-2026';
const grant = z.object({
  operationId: z.string(),
  scopeKind: z.enum(['global', 'collection']),
  collectionKey: z.string().nullable(),
});
type Grant = z.infer<typeof grant>;
const articleOperations = ['documents.list', 'documents.get', 'documents.create'];
const articleGrants: Grant[] = articleOperations.map((operationId) => ({
  operationId,
  scopeKind: 'collection',
  collectionKey: 'articles',
}));
const credentialPage = z.object({
  rows: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      clientId: z.string().nullable(),
      resource: z.enum(['api', 'mcp']),
    }),
  ),
});
const role = z.object({ id: z.uuid(), version: z.number() });
const cliSuccess = z.object({ ok: z.literal(true), data: z.unknown() });

async function world() {
  const mcpPort = await availablePort();
  const root = await mkdtemp(join(tmpdir(), 'cms-real-cli-mcp-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const resource = `http://127.0.0.1:${mcpPort}/mcp`;
  const kit = await createCmsProcess('node', {
    frontendUrl: 'http://127.0.0.1:3000',
    environment: {
      CMS_MCP_RESOURCE: resource,
      CMS_MCP_BRIDGE_SECRET: bridgeSecret,
      CMS_STORAGE_ROOT: root,
    },
  });
  cleanup.push(kit.close);
  const permissionId = await bindOperations(kit.request, {
    ...kit.owner,
    collection: 'articles',
    code: 'process:articles',
    operations: articleOperations,
  });
  const createdRole = await kit.request('POST', '/v1/roles', {
    ...kit.owner,
    body: { code: 'process_editor', name: 'Process editor', permissionIds: [permissionId] },
  });
  expect(createdRole.status).toBe(201);
  const editorRole = role.parse(await createdRole.json());
  const email = 'cli-mcp-editor@example.test';
  const created = await kit.request('POST', '/v1/admins', {
    ...kit.owner,
    body: { email, roleId: editorRole.id },
  });
  expect(created.status).toBe(201);
  const invitation = extractToken(await kit.smtp.waitForMessage());
  expect(
    (
      await kit.request('POST', '/v1/auth/invitation-acceptances', {
        body: { token: invitation, newPassword: 'CLI MCP editor password 2026' },
      })
    ).status,
  ).toBe(204);
  const login = await kit.request('POST', '/v1/auth/login', {
    body: { email, password: 'CLI MCP editor password 2026' },
  });
  expect(login.status).toBe(200);
  const actor = z.object({ token: z.string() }).parse(await login.json());
  const origin = `http://127.0.0.1:${kit.port()}`;
  const state = await mkdtemp(join(tmpdir(), 'cms-real-cli-state-'));
  cleanup.push(() => rm(state, { recursive: true, force: true }));
  return {
    kit,
    origin,
    resource,
    root,
    mcpPort,
    actor,
    editorRole,
    permissionId,
    cliEnv: { CMS_API_ORIGIN: origin, CMS_CLI_STATE_DIR: state },
  };
}
type World = Awaited<ReturnType<typeof world>>;

async function consent(
  url: URL,
  options: { request: ApiClient; token: string; grants: Grant[]; name: string },
) {
  const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  expect(response.status).toBe(302);
  const frontend = new URL(response.headers.get('location') ?? '');
  expect(frontend.pathname).toBe('/authorize');
  const id = frontend.searchParams.get('request');
  expect(id).toBeTruthy();
  const request = await options.request('GET', `/v1/oauth/requests/${id}`, {
    token: options.token,
  });
  expect(request.status).toBe(200);
  const available = z
    .object({ resource: z.string(), availableGrants: z.array(grant) })
    .parse(await request.json());
  expect(available.resource).toBe(url.searchParams.get('resource'));
  for (const selected of options.grants) expect(available.availableGrants).toContainEqual(selected);
  const decision = await options.request('POST', `/v1/oauth/requests/${id}/decisions`, {
    token: options.token,
    body: { approved: true, grants: options.grants, name: options.name },
  });
  expect(decision.status).toBe(200);
  const target = new URL(
    z.object({ redirectTo: z.string() }).parse(await decision.json()).redirectTo,
  );
  const callback = new URL(url.searchParams.get('redirect_uri') ?? '');
  expect(target.origin + target.pathname).toBe(callback.origin + callback.pathname);
  expect(target.searchParams.get('state')).toBe(url.searchParams.get('state'));
  expect(target.searchParams.get('iss')).toBe(url.origin);
  return target;
}

async function executeCli(current: World, args: string[], input?: unknown) {
  return runCliProcess({ env: current.cliEnv, args, ...(input === undefined ? {} : { input }) });
}

async function rolePermissions(current: World, permissions: string[], version: number) {
  const response = await current.kit.request(
    'PUT',
    `/v1/roles/${current.editorRole.id}/permissions`,
    { ...current.kit.owner, body: { version, permissionIds: permissions } },
  );
  expect(response.status).toBe(200);
  return role.parse(await response.json());
}

it('executes CLI PKCE, an authorized document write, API restart, current RBAC and login revocation against PostgreSQL', async () => {
  const current = await world();
  const login = startCliProcess({ env: current.cliEnv, args: ['auth', 'login', '--no-browser'] });
  cleanup.push(() => login.close());
  const target = await consent(await login.authorization, {
    request: current.kit.request,
    ...current.actor,
    grants: articleGrants,
    name: 'Actual CLI terminal',
  });
  expect(
    (await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(5000) })).status,
  ).toBe(200);
  const loggedIn = await login.result;
  expect(loggedIn.code).toBe(0);
  expect(cliSuccess.parse(JSON.parse(loggedIn.stdout)).data).toMatchObject({ loggedIn: true });
  const created = await executeCli(current, ['documents', 'create'], {
    input: { collection: 'articles', data: { title: 'Created by actual CLI', slug: 'actual-cli' } },
    idempotencyKey: randomUUID(),
  });
  expect(created.code).toBe(0);
  const document = contentDocument.parse(cliSuccess.parse(JSON.parse(created.stdout)).data);
  expect(document.data).toMatchObject({ title: 'Created by actual CLI', slug: 'actual-cli' });
  const documentPath = `/v1/collections/articles/documents/${document.id}`;
  expect(
    await (await current.kit.request('GET', documentPath, current.kit.owner)).json(),
  ).toMatchObject({ id: document.id, revision: 1, data: { title: 'Created by actual CLI' } });
  const outside = await executeCli(current, ['roles', 'list'], { input: {} });
  expect(outside.code).toBe(3);
  const problem = z
    .object({
      ok: z.literal(false),
      error: z.object({ code: z.literal('forbidden'), requestId: z.uuid() }),
    })
    .parse(JSON.parse(outside.stderr));
  expect(problem.error.code).toBe('forbidden');
  await current.kit.restart();
  expect(
    (
      await executeCli(current, ['documents', 'get'], {
        input: { collection: 'articles', id: document.id },
      })
    ).code,
  ).toBe(0);
  const restricted = await rolePermissions(current, [], current.editorRole.version);
  const denied = await executeCli(current, ['documents', 'get'], {
    input: { collection: 'articles', id: document.id },
  });
  expect(denied.code).toBe(3);
  expect(denied.stdout).toBe('');
  await rolePermissions(current, [current.permissionId], restricted.version);
  expect(
    (
      await executeCli(current, ['documents', 'get'], {
        input: { collection: 'articles', id: document.id },
      })
    ).code,
  ).toBe(0);
  const listing = credentialPage.parse(
    await (await current.kit.request('GET', '/v1/me/credentials?kind=oauth', current.actor)).json(),
  );
  const terminal = listing.rows.find((credential) => credential.name === 'Actual CLI terminal');
  expect(terminal).toMatchObject({ clientId: 'cms-cli', resource: 'api' });
  expect(
    (await current.kit.request('DELETE', `/v1/me/credentials/${terminal?.id}`, current.actor))
      .status,
  ).toBe(204);
  const revoked = await executeCli(current, ['documents', 'get'], {
    input: { collection: 'articles', id: document.id },
  });
  expect(revoked.code).toBe(3);
  expect(revoked.stdout).toBe('');
  expect(
    z
      .object({ ok: z.literal(false), error: z.object({ code: z.string() }) })
      .parse(JSON.parse(revoked.stderr)).ok,
  ).toBe(false);
});

function clientAt(origin: string): ApiClient {
  return (method, path, options: ApiOptions = {}) =>
    fetch(`${origin}${path}`, {
      method,
      signal: AbortSignal.timeout(10000),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
}

async function replica(current: World) {
  const port = await availablePort();
  const server = await startProcess(nodeExecutable(), 'apps/api/dist/main.js', {
    ...process.env,
    DATABASE_URL: current.kit.store.runtimeConnectionString,
    DATABASE_SCHEMA: current.kit.store.schema,
    CMS_RATE_LIMIT_SECRET: 'independent-collections-network-secret-2026',
    API_HOST: '127.0.0.1',
    API_PORT: String(port),
    CMS_API_ORIGIN: current.origin,
    CMS_MCP_RESOURCE: current.resource,
    CMS_MCP_BRIDGE_SECRET: bridgeSecret,
    NODE_ENV: 'test',
    CMS_FRONTEND_URL: 'http://127.0.0.1:3000',
    CMS_STORAGE_DRIVER: 'local',
    CMS_STORAGE_ROOT: current.root,
    SMTP_HOST: current.kit.smtp.host,
    SMTP_PORT: String(current.kit.smtp.port),
    SMTP_SECURE: 'false',
  });
  cleanup.push(server.close);
  return {
    origin: `http://127.0.0.1:${server.port}`,
    request: clientAt(`http://127.0.0.1:${server.port}`),
  };
}

async function issueMcpOAuth(current: World, second: Awaited<ReturnType<typeof replica>>) {
  const callback = `http://127.0.0.1:${await availablePort()}/callback`;
  const registered = await fetch(`${current.origin}/oauth/register`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Actual MCP process',
      redirect_uris: [callback],
      application_type: 'native',
      grant_types: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_method: 'none',
      scope: 'cms offline_access',
    }),
  });
  expect(registered.status).toBe(201);
  const client = z.object({ client_id: z.string() }).parse(await registered.json());
  const verifier = randomBytes(48).toString('base64url');
  const url = new URL('/oauth/authorize', current.origin);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: callback,
    state: randomBytes(32).toString('base64url'),
    code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    scope: 'cms offline_access',
    resource: current.resource,
  }).toString();
  const target = await consent(url, {
    request: second.request,
    ...current.actor,
    grants: articleGrants,
    name: 'Actual MCP OAuth',
  });
  const response = await fetch(`${second.origin}/oauth/token`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      grant_type: 'authorization_code',
      code: target.searchParams.get('code') ?? '',
      code_verifier: verifier,
      redirect_uri: callback,
      resource: current.resource,
    }),
  });
  expect(response.status).toBe(200);
  const issued = z
    .object({ access_token: z.string(), token_type: z.literal('Bearer') })
    .parse(await response.json());
  return { ...issued, clientId: client.client_id };
}

async function exchange(origin: string, incoming: string) {
  const response = await fetch(`${origin}/oauth/exchange`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${incoming}`, 'x-cms-mcp-secret': bridgeSecret },
  });
  expect(response.status).toBe(200);
  return z.object({ access_token: z.string() }).parse(await response.json()).access_token;
}

async function mcp(current: World, options: { port: number; token: string; modern: boolean }) {
  const server = await startProcess(nodeExecutable(), 'apps/mcp/dist/main.js', {
    ...process.env,
    CMS_API_ORIGIN: current.origin,
    CMS_MCP_RESOURCE: current.resource,
    CMS_MCP_BRIDGE_SECRET: bridgeSecret,
    MCP_PORT: String(options.port),
    MCP_HOST: '127.0.0.1',
  });
  cleanup.push(server.close);
  const client = new Client(
    { name: 'actual-postgres-client', version: '1' },
    options.modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
  );
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.port}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${options.token}` } },
    }),
  );
  return { client, origin: `http://127.0.0.1:${server.port}` };
}

async function mcpRequest(origin: string, token: string) {
  return fetch(`${origin}/mcp`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
  });
}

it('shares grants across API replicas and enforces Key/OAuth scopes, RBAC and revocation through two real MCP processes', async () => {
  const current = await world();
  const second = await replica(current);
  const createdKey = await current.kit.request('POST', '/v1/me/api-keys', {
    ...current.actor,
    body: {
      name: 'Actual MCP Key',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      grants: articleGrants.filter((selected) => selected.operationId !== 'documents.create'),
    },
  });
  expect(createdKey.status).toBe(201);
  const key = z
    .object({ apiKey: z.string(), credential: z.object({ id: z.uuid() }) })
    .parse(await createdKey.json());
  const oauth = await issueMcpOAuth(current, second);
  expect((await second.request('GET', '/v1/me', { token: key.apiKey })).status).toBe(401);
  expect((await second.request('GET', '/v1/me', { token: oauth.access_token })).status).toBe(401);
  const missingBridge = await fetch(`${second.origin}/oauth/exchange`, {
    method: 'POST',
    signal: AbortSignal.timeout(5000),
    headers: { authorization: `Bearer ${key.apiKey}` },
  });
  expect(missingBridge.status).toBe(401);
  expect(await missingBridge.json()).toMatchObject({ error: 'invalid_client' });
  const keyApi = await exchange(second.origin, key.apiKey);
  const oauthApi = await exchange(second.origin, oauth.access_token);
  const keyMcp = await mcp(current, { port: current.mcpPort, token: key.apiKey, modern: true });
  const oauthMcp = await mcp(current, {
    port: await availablePort(),
    token: oauth.access_token,
    modern: false,
  });
  const moved = await mcpRequest(oauthMcp.origin, key.apiKey);
  expect(moved.status).toBe(200);
  const movedTools = z
    .object({ result: z.object({ tools: z.array(z.object({ name: z.string() })) }) })
    .parse(await moved.json())
    .result.tools.map((tool) => tool.name);
  expect(movedTools).toContain('documents_get');
  expect(movedTools).not.toContain('documents_create');
  const keyTools = (await keyMcp.client.listTools()).tools.map((tool) => tool.name);
  expect(keyTools).toContain('documents_get');
  expect(keyTools).not.toContain('documents_create');
  const toolResult = await oauthMcp.client.callTool({
    name: 'documents_create',
    arguments: {
      collection: 'articles',
      data: { title: 'Created by actual MCP', slug: 'actual-mcp' },
      idempotencyKey: randomUUID(),
    },
  });
  const document = contentDocument.parse(
    z.object({ result: z.unknown() }).parse(toolResult.structuredContent).result,
  );
  expect(document.data).toMatchObject({ title: 'Created by actual MCP' });
  const path = `/v1/collections/articles/documents/${document.id}`;
  const persisted = await second.request('GET', path, { token: keyApi });
  expect(persisted.status).toBe(200);
  expect(await persisted.json()).toMatchObject({
    id: document.id,
    revision: 1,
    data: { title: 'Created by actual MCP', slug: 'actual-mcp' },
  });

  expect(
    (
      await second.request('POST', '/v1/collections/articles/documents', {
        token: keyApi,
        body: { data: { title: 'Denied', slug: 'denied-by-grant' } },
      })
    ).status,
  ).toBe(403);
  expect(
    await keyMcp.client.callTool({
      name: 'documents_get',
      arguments: { collection: 'articles', id: document.id },
    }),
  ).toMatchObject({ structuredContent: { result: { id: document.id } } });
  const restricted = await rolePermissions(current, [], current.editorRole.version);
  expect((await keyMcp.client.listTools()).tools.map((tool) => tool.name)).not.toContain(
    'documents_get',
  );
  expect((await oauthMcp.client.listTools()).tools.map((tool) => tool.name)).not.toContain(
    'documents_get',
  );
  expect((await second.request('GET', path, { token: oauthApi })).status).toBe(403);
  await rolePermissions(current, [current.permissionId], restricted.version);
  expect((await oauthMcp.client.listTools()).tools.map((tool) => tool.name)).toContain(
    'documents_get',
  );
  expect(
    (await second.request('DELETE', `/v1/me/credentials/${key.credential.id}`, current.actor))
      .status,
  ).toBe(204);
  expect((await mcpRequest(keyMcp.origin, key.apiKey)).status).toBe(401);
  expect((await second.request('GET', path, { token: keyApi })).status).toBe(401);
  expect((await oauthMcp.client.listTools()).tools.map((tool) => tool.name)).toContain(
    'documents_get',
  );
  const revokedClient = await second.request(
    'POST',
    `/v1/me/oauth-clients/${oauth.clientId}/revocations`,
    { ...current.actor, body: {} },
  );
  expect(revokedClient.status).toBe(200);
  expect(await revokedClient.json()).toMatchObject({ revoked: 1 });
  expect((await mcpRequest(oauthMcp.origin, oauth.access_token)).status).toBe(401);
  expect((await second.request('GET', path, { token: oauthApi })).status).toBe(401);
});
