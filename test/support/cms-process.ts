import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { createTestDatabase } from './database.ts';
import { createTestSmtp } from './smtp.ts';
import { runCommand, startProcess } from './process.ts';
import { nodeExecutable } from './node-runtime.ts';
import type { ApiClient, ApiOptions } from './cms-api.ts';

export async function createCmsProcess(mode: 'bun' | 'node') {
  const store = await createTestDatabase();
  const smtp = await createTestSmtp();
  const storage = await mkdtemp(join(tmpdir(), 'cms-network-assets-'));
  const { binary, folder, extension, env } = settings(mode, { store, smtp, storage });
  let server: Awaited<ReturnType<typeof startProcess>> | undefined;
  const request = requestClient(() => server);
  async function start() {
    server = await startProcess(binary, `${folder}/main.${extension}`, env);
  }
  async function close() {
    try {
      await server?.close();
    } finally {
      await smtp.close();
      await store.close();
      await rm(storage, { recursive: true, force: true });
    }
  }
  try {
    initializeProcesses({ binary, folder, extension, env });
    await start();
    const owner = await loginOwner(request);
    return {
      request,
      owner,
      smtp,
      store,
      close,
      async restart() {
        await server?.close();
        server = undefined;
        await start();
      },
      port: () => {
        if (!server) throw new Error('Service is not running');
        return server.port;
      },
    };
  } catch (error) {
    await close();
    throw error;
  }
}

type RunningServer = Awaited<ReturnType<typeof startProcess>>;
function initializeProcesses(config: ReturnType<typeof settings>) {
  const { binary, folder, extension, env } = config;
  runCommand(binary, `${folder}/commands/reconcile-operations.${extension}`, { env });
  const activation = runCommand(binary, `${folder}/commands/backfill-content.${extension}`, {
    env,
    args: ['--activate'],
  });
  z.object({ type: z.literal('activated'), fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).parse(
    JSON.parse(activation),
  );
  runCommand(binary, `${folder}/commands/initialize-admin.${extension}`, {
    env,
    args: ['--email', 'content-owner@example.test'],
    input: 'Content owner password 2026\n',
  });
}
function settings(
  mode: 'bun' | 'node',
  input: {
    store: Awaited<ReturnType<typeof createTestDatabase>>;
    smtp: Awaited<ReturnType<typeof createTestSmtp>>;
    storage: string;
  },
) {
  const binary = mode === 'bun' ? process.execPath : nodeExecutable();
  const folder = mode === 'bun' ? 'apps/api/src' : 'apps/api/dist';
  const extension = mode === 'bun' ? 'ts' : 'js';
  const env = {
    ...process.env,
    DATABASE_URL: input.store.connectionString,
    DATABASE_SCHEMA: input.store.schema,
    CMS_RATE_LIMIT_SECRET: 'independent-collections-network-secret-2026',
    API_HOST: '127.0.0.1',
    API_PORT: '0',
    NODE_ENV: 'test',
    CMS_STORAGE_DRIVER: 'local',
    CMS_STORAGE_ROOT: input.storage,
    CMS_MAINTENANCE_INTERVAL_MS: '100',
    SMTP_HOST: input.smtp.host,
    SMTP_PORT: String(input.smtp.port),
    SMTP_SECURE: 'false',
  };
  return { binary, folder, extension, env };
}
function requestClient(server: () => RunningServer | undefined) {
  return (method: string, path: string, options: ApiOptions = {}): Promise<Response> => {
    const active = server();
    if (!active) throw new Error('Service is not running');
    return fetch(`http://127.0.0.1:${active.port}${path}`, {
      method,
      signal: AbortSignal.timeout(10_000),
      headers: {
        'content-type': 'application/json',
        'idempotency-key': options.key ?? randomUUID(),
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  };
}

async function loginOwner(request: ApiClient) {
  const response = await request('POST', '/v1/auth/login', {
    body: { email: 'content-owner@example.test', password: 'Content owner password 2026' },
  });
  return z.object({ token: z.string() }).parse(await response.json());
}
