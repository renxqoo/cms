import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { z } from 'zod';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createApiClient } from '@new-cms/api-client/client';
import { createCmsProcess } from '../test/support/cms-process.ts';
import { bindOperations, contentDocument } from '../test/support/cms-api.ts';
import { runCliProcess } from '../test/support/cli-process.ts';
import { availablePort } from '../test/support/tcp-port.ts';
import { nodeExecutable } from '../test/support/node-runtime.ts';
import { startProcess } from '../test/support/process.ts';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).toReversed()) await close();
});
const bridgeSecret = 'editor-session-cross-process-bridge-secret-2026';
const operations = [
  'documents.create',
  'documents.get',
  'documents.update',
  'documents.acquireLock',
  'documents.getLock',
  'documents.releaseLock',
];
async function world() {
  const port = await availablePort();
  const resource = `http://127.0.0.1:${port}/mcp`;
  const kit = await createCmsProcess('node', {
    environment: { CMS_MCP_RESOURCE: resource, CMS_MCP_BRIDGE_SECRET: bridgeSecret },
  });
  cleanup.push(kit.close);
  await bindOperations(kit.request, {
    ...kit.owner,
    collection: 'articles',
    code: 'session:clients',
    operations,
  });
  const response = await kit.request('POST', '/v1/collections/articles/documents', {
    ...kit.owner,
    body: { data: { title: 'Original', slug: 'editor-session-clients' } },
  });
  expect(response.status).toBe(201);
  const document = contentDocument.parse(await response.json());
  const root = await mkdtemp(join(tmpdir(), 'cms-editor-session-clients-'));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  return { kit, document, root, port, resource, origin: `http://127.0.0.1:${kit.port()}` };
}
type World = Awaited<ReturnType<typeof world>>;
async function delegate(current: World, name: string) {
  const response = await current.kit.request('POST', '/v1/me/api-keys', {
    ...current.kit.owner,
    body: {
      name,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      grants: operations.map((operationId) => ({
        operationId,
        scopeKind: 'collection',
        collectionKey: 'articles',
      })),
    },
  });
  expect(response.status).toBe(201);
  const key = z
    .object({ apiKey: z.string(), credential: z.object({ id: z.uuid() }) })
    .parse(await response.json());
  const exchanged = await fetch(`${current.origin}/oauth/exchange`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key.apiKey}`, 'x-cms-mcp-secret': bridgeSecret },
    signal: AbortSignal.timeout(5000),
  });
  expect(exchanged.status).toBe(200);
  const { access_token: token } = z
    .object({ access_token: z.string() })
    .parse(await exchanged.json());
  const client = createApiClient({
    origin: current.origin,
    token,
    timeoutMs: 5000,
    maxFileBytes: 1048576,
    maxResponseBytes: 1048576,
  });
  return { ...key, token, client };
}
async function mcp(current: World, key: string) {
  const server = await startProcess(nodeExecutable(), 'apps/mcp/dist/main.js', {
    ...process.env,
    CMS_API_ORIGIN: current.origin,
    CMS_MCP_RESOURCE: current.resource,
    CMS_MCP_BRIDGE_SECRET: bridgeSecret,
    MCP_PORT: String(current.port),
    MCP_HOST: '127.0.0.1',
  });
  cleanup.push(server.close);
  const client = new Client(
    { name: 'editor-session-client', version: '1' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  cleanup.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(current.resource), {
      requestInit: { headers: { authorization: `Bearer ${key}` } },
    }),
  );
  return client;
}
it('continues the same owned lease through SDK, real CLI and MCP processes while blocking absent sessions and other delegates', async () => {
  const current = await world();
  const first = await delegate(current, 'First editor');
  const second = await delegate(current, 'Other editor');
  const editorId = randomUUID();
  const target = { collection: 'articles', id: current.document.id, locale: 'en' };
  expect(await first.client.call('documents.acquireLock', { ...target, editorId })).toMatchObject({
    owned: true,
    lease: { generation: 1 },
  });
  const patch = { ...target, revision: current.document.revision, data: { title: 'SDK edit' } };
  await expect(first.client.call('documents.update', patch)).rejects.toMatchObject({
    code: 'document_locked',
  });
  const updated = contentDocument.parse(
    await first.client.call('documents.update', patch, { editorSessionId: editorId }),
  );
  expect(updated.data['title']).toBe('SDK edit');
  const cliEnv = {
    CMS_API_ORIGIN: current.origin,
    CMS_ACCESS_TOKEN: first.token,
    CMS_CLI_STATE_DIR: current.root,
  };
  const cliInput = {
    input: { ...target, revision: updated.revision, data: { title: 'CLI edit' } },
  };
  const blockedCli = await runCliProcess({
    env: cliEnv,
    args: ['documents', 'update'],
    input: cliInput,
  });
  expect(blockedCli.code).not.toBe(0);
  expect(blockedCli.stderr).toContain('document_locked');
  const cli = await runCliProcess({
    env: cliEnv,
    args: ['documents', 'update'],
    input: { ...cliInput, editorSessionId: editorId },
  });
  expect(cli.code).toBe(0);
  expect(cli.stderr).toBe('');
  const cliDocument = contentDocument.parse(
    z.object({ data: z.unknown() }).parse(JSON.parse(cli.stdout) as unknown).data,
  );
  expect(cliDocument.data['title']).toBe('CLI edit');
  const protocol = await mcp(current, first.apiKey);
  const argumentsWithoutSession = {
    ...target,
    revision: cliDocument.revision,
    data: { title: 'MCP edit' },
  };
  const blockedMcp = await protocol.callTool({
    name: 'documents_update',
    arguments: argumentsWithoutSession,
  });
  expect(blockedMcp).toMatchObject({
    isError: true,
    structuredContent: { error: { code: 'document_locked' } },
  });
  const result = await protocol.callTool({
    name: 'documents_update',
    arguments: { ...argumentsWithoutSession, editorSessionId: editorId },
  });
  const saved = contentDocument.parse(
    z.object({ result: z.unknown() }).parse(result.structuredContent).result,
  );
  expect(saved.data['title']).toBe('MCP edit');
  await expect(
    second.client.call(
      'documents.update',
      { ...target, revision: saved.revision, data: { title: 'Other delegate' } },
      { editorSessionId: editorId },
    ),
  ).rejects.toMatchObject({ code: 'document_locked' });
  expect(
    await second.client.call('documents.releaseLock', { ...target, editorId, generation: 1 }),
  ).toMatchObject({ owned: false, lease: { generation: 1 } });
  expect(
    await first.client.call('documents.releaseLock', { ...target, editorId, generation: 1 }),
  ).toMatchObject({ owned: false, lease: null });
  expect(await second.client.call('documents.acquireLock', { ...target, editorId })).toMatchObject({
    owned: true,
  });
  expect(
    (
      await current.kit.request(
        'DELETE',
        `/v1/me/credentials/${second.credential.id}`,
        current.kit.owner,
      )
    ).status,
  ).toBe(204);
  await expect(
    second.client.call(
      'documents.update',
      { ...target, revision: saved.revision, data: { title: 'Revoked' } },
      { editorSessionId: editorId },
    ),
  ).rejects.toMatchObject({ status: 401 });
  const owner = createApiClient({
    origin: current.origin,
    token: current.kit.owner.token,
    timeoutMs: 5000,
    maxFileBytes: 1048576,
    maxResponseBytes: 1048576,
  });
  const final = contentDocument.parse(
    await owner.call('documents.update', {
      ...target,
      revision: saved.revision,
      data: { title: 'After revocation' },
    }),
  );
  expect(final.data['title']).toBe('After revocation');
});
