import { afterEach, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createSessionStore } from '../apps/cli/src/state.ts';
import { startProcess } from '../test/support/process.ts';
import { nodeExecutable } from '../test/support/node-runtime.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close();
});

async function upstream() {
  const seen: URL[] = [];
  let refreshes = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://api.test');
    seen.push(url);
    response.setHeader('content-type', 'application/json');
    const bearer = request.headers.authorization;
    if (url.pathname === '/oauth/exchange') {
      if (
        request.headers['x-cms-mcp-secret'] !== 'bridge-secret-for-real-process-tests-2026' ||
        !['Bearer key-a', 'Bearer key-b'].includes(bearer ?? '')
      ) {
        response.writeHead(401).end('{}');
        return;
      }
      response.end(
        JSON.stringify({
          access_token: bearer === 'Bearer key-a' ? 'api-a' : 'api-b',
          token_type: 'Bearer',
          expires_in: 60,
        }),
      );
      return;
    }
    if (url.pathname === '/oauth/token') {
      let body = '';
      request.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      request.on('end', () => {
        const form = new URLSearchParams(body);
        refreshes++;
        if (
          refreshes !== 1 ||
          form.get('refresh_token') !== 'single-refresh' ||
          form.get('client_id') !== 'cms-cli' ||
          request.headers.authorization !== undefined
        ) {
          response.writeHead(400).end('{}');
          return;
        }
        response.end(
          JSON.stringify({
            access_token: 'api-a',
            token_type: 'Bearer',
            expires_in: 600,
            refresh_token: 'rotated-refresh',
            scope: 'cms offline_access',
          }),
        );
      });
      return;
    }
    if (url.pathname === '/v1/me/operations') {
      response.end(
        JSON.stringify({
          rows: [{ operationId: bearer === 'Bearer api-b' ? 'roles.list' : 'documents.list' }],
          total: 1,
        }),
      );
      return;
    }
    if (url.pathname === '/v1/me') {
      response.end(JSON.stringify({ name: bearer === 'Bearer api-b' ? 'B' : 'A' }));
      return;
    }
    if (url.pathname === '/v1/collections/articles/documents') {
      response.end(JSON.stringify({ rows: [], total: 0, page: 1, pageSize: 20 }));
      return;
    }
    response
      .writeHead(403)
      .end(JSON.stringify({ error: { code: 'forbidden', requestId: 'process-trace' } }));
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing upstream address');
  cleanup.push(
    () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  );
  return { origin: `http://127.0.0.1:${address.port}`, seen, refreshes: () => refreshes };
}

function cli(binary: string, options: { args: string[]; env: NodeJS.ProcessEnv; input?: string }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(binary, ['apps/cli/dist/main.js', ...options.args], {
      env: options.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('CLI process timed out'));
    }, 10000);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    child.stdin.end(options.input);
  });
}

it('runs SDK CLI JSON from stdin and a file in a real Node process and keeps HTTP errors on stderr', async () => {
  const api = await upstream();
  const root = await mkdtemp(join(tmpdir(), 'cms-cli-process-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const env = {
    ...process.env,
    CMS_API_ORIGIN: api.origin,
    CMS_ACCESS_TOKEN: 'api-a',
    CMS_CLI_STATE_DIR: root,
  };
  const stdin = await cli(nodeExecutable(), { env, args: ['access', 'me'], input: '{"input":{}}' });
  expect(stdin.code).toBe(0);
  expect(JSON.parse(stdin.stdout) as unknown).toMatchObject({ ok: true, data: { name: 'A' } });
  expect(stdin.stderr).toBe('');
  const path = join(root, 'input.json');
  await writeFile(
    path,
    JSON.stringify({
      input: {
        collection: 'articles',
        folderId: null,
        select: ['title'],
        where: { title: { eq: 'A&B' } },
      },
    }),
  );
  const file = await cli(nodeExecutable(), {
    env,
    args: ['documents', 'list', '--input-file', path],
  });
  expect(file.code).toBe(0);
  const request = api.seen.find((url) => url.pathname === '/v1/collections/articles/documents');
  expect(request?.searchParams.get('folderId')).toBe('null');
  expect(request?.searchParams.get('select')).toBe('["title"]');
  expect(request?.searchParams.get('where')).toBe('{"title":{"eq":"A&B"}}');
  const denied = await cli(nodeExecutable(), {
    env,
    args: ['roles', 'list'],
    input: '{"input":{}}',
  });
  expect(denied.code).toBe(3);
  expect(denied.stdout).toBe('');
  expect(JSON.parse(denied.stderr) as unknown).toMatchObject({
    ok: false,
    error: { code: 'forbidden', requestId: 'process-trace' },
  });
});

it.each(['legacy', 'modern'] as const)(
  'serves official %s MCP clients from a real Node process with per-credential tool lists',
  async (mode) => {
    const api = await upstream();
    const server = await startProcess(nodeExecutable(), 'apps/mcp/dist/main.js', {
      ...process.env,
      CMS_API_ORIGIN: api.origin,
      CMS_MCP_RESOURCE: 'http://127.0.0.1:3002/mcp',
      CMS_MCP_BRIDGE_SECRET: 'bridge-secret-for-real-process-tests-2026',
      MCP_PORT: '0',
    });
    cleanup.push(server.close);
    async function connect(key: string) {
      const client = new Client(
        { name: `cms-${mode}-test`, version: '1.0.0' },
        mode === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
      );
      const transport = new StreamableHTTPClientTransport(
        new URL(`http://127.0.0.1:${server.port}/mcp`),
        { requestInit: { headers: { authorization: `Bearer ${key}` } } },
      );
      cleanup.push(() => client.close());
      await client.connect(transport);
      return client;
    }
    const a = await connect('key-a');
    const b = await connect('key-b');
    const aTools = (await a.listTools()).tools.map((tool) => tool.name);
    const bTools = (await b.listTools()).tools.map((tool) => tool.name);
    expect(aTools).toContain('documents_list');
    expect(aTools).not.toContain('roles_list');
    expect(bTools).toContain('roles_list');
    expect(bTools).not.toContain('documents_list');
    expect(await a.callTool({ name: 'access_me', arguments: {} })).toMatchObject({
      structuredContent: { result: { name: 'A' } },
    });
    expect(await b.callTool({ name: 'access_me', arguments: {} })).toMatchObject({
      structuredContent: { result: { name: 'B' } },
    });
  },
);

it('coordinates one-use refresh rotation between two actual CLI processes', async () => {
  const api = await upstream();
  const root = await mkdtemp(join(tmpdir(), 'cms-cli-refresh-process-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const store = createSessionStore({
    origin: api.origin,
    profile: 'default',
    stateDir: root,
    lockLimits: { pollMs: 50, invalidGraceMs: 60_000, waitMs: 60_000 },
  });
  await store.write({
    accessToken: 'expired',
    refreshToken: 'single-refresh',
    expiresAt: 0,
    scope: 'cms offline_access',
  });
  const env = {
    ...process.env,
    CMS_API_ORIGIN: api.origin,
    CMS_CLI_STATE_DIR: root,
    CMS_ACCESS_TOKEN: undefined,
  };
  const options = { env, args: ['access', 'me'], input: '{"input":{}}' };
  const results = await Promise.all([
    cli(nodeExecutable(), options),
    cli(nodeExecutable(), options),
  ]);
  expect(results.map((result) => result.code)).toEqual([0, 0]);
  expect(api.refreshes()).toBe(1);
  expect((await store.read())?.refreshToken).toBe('rotated-refresh');
});
