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

export interface CmsProcessOptions {
  frontendUrl?: string;
  navigationPaths?: readonly string[];
  navigationIcons?: readonly string[];
  clientOrigin?: string;
  initializePublicContent?: boolean;
  sharedStorage?: {
    bucket: string;
    region: string;
    endpoint: string;
    credentials: { accessKeyId: string; secretAccessKey: string };
  };
}

export async function createCmsProcess(mode: 'bun' | 'node', options: CmsProcessOptions = {}) {
  const store = await createTestRuntimeDatabase();
  let smtp: Awaited<ReturnType<typeof createTestSmtp>> | undefined;
  let storage: string | undefined;
  let processes: ReturnType<typeof processControls> | undefined;
  async function close() {
    try {
      await processes?.close();
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
    const { binary, folder, extension, env } = settings(mode, { store, smtp, storage }, options);
    processes = processControls({ binary, folder, extension, env });
    initializeProcesses(
      { binary, folder, extension, env },
      options.initializePublicContent === true,
    );
    await processes.start();
    const owner = await loginOwner(processes.api.request);
    return { ...processes.api, owner, smtp, store, close };
  } catch (error) {
    await close();
    throw error;
  }
}

type RunningServer = Awaited<ReturnType<typeof startProcess>>;
function initializeProcesses(config: ReturnType<typeof settings>, publicContent: boolean) {
  const { binary, folder, extension, env } = config;
  runCommand(
    binary,
    `${folder}/commands/${publicContent ? 'migrate' : 'reconcile-operations'}.${extension}`,
    { env },
  );
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
  if (publicContent)
    runCommand(binary, `${folder}/commands/initialize-content.${extension}`, {
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
    CMS_STORAGE_DRIVER: options.sharedStorage ? 's3' : 'local',
    CMS_STORAGE_ROOT: input.storage,
    CMS_MAINTENANCE_INTERVAL_MS: '100',
    SMTP_HOST: input.smtp.host,
    SMTP_PORT: String(input.smtp.port),
    SMTP_SECURE: 'false',
    ...(options.clientOrigin ? { ONEASTER_CLIENT_ORIGIN: options.clientOrigin } : {}),
    ...(options.sharedStorage
      ? {
          CMS_S3_BUCKET: options.sharedStorage.bucket,
          CMS_S3_REGION: options.sharedStorage.region,
          CMS_S3_ENDPOINT: options.sharedStorage.endpoint,
          CMS_S3_FORCE_PATH_STYLE: 'true',
          AWS_ACCESS_KEY_ID: options.sharedStorage.credentials.accessKeyId,
          AWS_SECRET_ACCESS_KEY: options.sharedStorage.credentials.secretAccessKey,
        }
      : {}),
    ...(options.frontendUrl ? { CMS_FRONTEND_URL: options.frontendUrl } : {}),
    ...(options.navigationPaths ? { CMS_NAVIGATION_PATHS: options.navigationPaths.join(',') } : {}),
    ...(options.navigationIcons ? { CMS_NAVIGATION_ICONS: options.navigationIcons.join(',') } : {}),
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
    }).catch((error: unknown) => {
      throw new Error(`CMS request failed: ${method} ${path}`, { cause: error });
    });
  };
}

async function loginOwner(request: ApiClient) {
  const response = await request('POST', '/v1/auth/login', {
    body: { email: 'content-owner@example.test', password: 'Content owner password 2026' },
  });
  return z.object({ token: z.string() }).parse(await response.json());
}

function processControls(config: ReturnType<typeof settings>) {
  const { binary, folder, extension, env } = config;
  let server: RunningServer | undefined;
  const peers = new Set<RunningServer>();
  const request = requestClient(() => server);
  async function start() {
    server = await startProcess(binary, `${folder}/main.${extension}`, env);
  }
  async function stop() {
    await server?.close();
    server = undefined;
  }
  return {
    start,
    close: () =>
      cleanupAll([...Array.from(peers, (peer) => () => peer.close()), () => server?.close()]),
    api: {
      request,
      stop,
      async restart() {
        await stop();
        await start();
      },
      async startPeer() {
        const peer = await startProcess(binary, `${folder}/main.${extension}`, env);
        peers.add(peer);
        return {
          port: peer.port,
          async close() {
            if (peers.delete(peer)) await peer.close();
          },
        };
      },
      port() {
        if (!server) throw new Error('Service is not running');
        return server.port;
      },
    },
  };
}
