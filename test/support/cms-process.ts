import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { createTestRuntimeDatabase } from './runtime-database.ts';
import { createTestSmtp } from './smtp.ts';
import { runCommand, startProcess } from './process.ts';
import { nodeExecutable } from './node-runtime.ts';
import { cleanupAll } from './cleanup.ts';
import type { ApiClient, ApiOptions } from './cms-api.ts';
import { availablePort } from './tcp-port.ts';

export interface CmsProcessOptions {
  environment?: NodeJS.ProcessEnv;
  frontendUrl?: string;
  navigationPaths?: readonly string[];
  navigationIcons?: readonly string[];
}

export async function createCmsProcess(mode: 'bun' | 'node', options: CmsProcessOptions = {}) {
  const store = await createTestRuntimeDatabase();
  let smtp: Awaited<ReturnType<typeof createTestSmtp>> | undefined;
  let storage: string | undefined;
  let server: Awaited<ReturnType<typeof startProcess>> | undefined;
  const request = requestClient(() => server);
  async function close() {
    try {
      await server?.close();
    } finally {
      await cleanupAll([
        () => smtp?.close(),
        () => store.close(),
        () => storage && rm(storage, { recursive: true, force: true }),
      ]);
    }
  }
  try {
    smtp = await createTestSmtp();
    storage = await mkdtemp(join(tmpdir(), 'cms-network-assets-'));
    const { binary, folder, extension, env } = await processSettings(
      mode,
      { store, smtp, storage },
      options,
    );
    async function start() {
      server = await startProcess(binary, `${folder}/main.${extension}`, env);
    }
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
      port: () => activePort(server),
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function processSettings(
  mode: 'bun' | 'node',
  input: Parameters<typeof settings>[1],
  options: CmsProcessOptions,
) {
  const port = await availablePort();
  return settings(mode, input, {
    ...options,
    environment: {
      ...options.environment,
      API_PORT: String(port),
      CMS_API_ORIGIN: `http://127.0.0.1:${port}`,
    },
  });
}

function activePort(server: RunningServer | undefined): number {
  if (!server) throw new Error('Service is not running');
  return server.port;
}

type RunningServer = Awaited<ReturnType<typeof startProcess>>;
function initializeProcesses(config: ReturnType<typeof settings>) {
  const { binary, folder, extension, env } = config;
  runCommand(binary, `${folder}/commands/reconcile-operations.${extension}`, { env });
  runCommand(binary, `${folder}/commands/grant-runtime-role.${extension}`, { env });
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
    store: Awaited<ReturnType<typeof createTestRuntimeDatabase>>;
    smtp: Awaited<ReturnType<typeof createTestSmtp>>;
    storage: string;
  },
  options: CmsProcessOptions,
) {
  const binary = mode === 'bun' ? process.execPath : nodeExecutable();
  const folder = mode === 'bun' ? 'apps/api/src' : 'apps/api/dist';
  const extension = mode === 'bun' ? 'ts' : 'js';
  const env = {
    ...process.env,
    DATABASE_URL: input.store.runtimeConnectionString,
    CMS_MIGRATION_DATABASE_URL: input.store.connectionString,
    CMS_DATABASE_RUNTIME_ROLE: input.store.roleName,
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
    ...(options.frontendUrl ? { CMS_FRONTEND_URL: options.frontendUrl } : {}),
    ...(options.navigationPaths ? { CMS_NAVIGATION_PATHS: options.navigationPaths.join(',') } : {}),
    ...(options.navigationIcons ? { CMS_NAVIGATION_ICONS: options.navigationIcons.join(',') } : {}),
    ...options.environment,
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
