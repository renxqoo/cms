import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { applicationAccounts } from './admin-application-data.ts';
import { createCmsProcess } from './cms-process.ts';
import { nodeExecutable } from './node-runtime.ts';
import { extractToken } from './smtp.ts';

async function seedAccounts(cms: Awaited<ReturnType<typeof createCmsProcess>>) {
  const current = await cms.request('GET', '/v1/me', cms.owner);
  const owner = z.object({ version: z.number() }).parse(await current.json());
  requireStatus(
    await cms.request('PATCH', '/v1/me', {
      ...cms.owner,
      body: { version: owner.version, displayName: applicationAccounts.owner.displayName },
    }),
    200,
  );
  const createdRole = await cms.request('POST', '/v1/roles', {
    ...cms.owner,
    body: { code: 'application_reader', name: 'Application reader', permissionIds: [] },
  });
  requireStatus(createdRole, 201);
  const role = z.object({ id: z.uuid() }).parse(await createdRole.json());
  requireStatus(
    await cms.request('POST', '/v1/admins', {
      ...cms.owner,
      body: {
        email: applicationAccounts.reader.email,
        displayName: applicationAccounts.reader.displayName,
        roleId: role.id,
      },
    }),
    201,
  );
  const token = extractToken(await cms.smtp.waitForMessage());
  requireStatus(
    await cms.request('POST', '/v1/auth/invitation-acceptances', {
      body: { token, newPassword: applicationAccounts.reader.password },
    }),
    204,
  );
}

function requireStatus(response: Response, status: number) {
  if (response.status !== status)
    throw new Error(`Application fixture expected HTTP ${status}, received ${response.status}.`);
}

interface NextProcessOptions {
  mode: 'development' | 'production';
  port: number;
  apiOrigin: string;
  signal?: AbortSignal | undefined;
}

function nextChild(options: NextProcessOptions) {
  const { mode, port, apiOrigin } = options;
  return spawn(
    mode === 'development' ? process.execPath : nodeExecutable(),
    [
      resolve('apps/admin/node_modules/next/dist/bin/next'),
      mode === 'development' ? 'dev' : 'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(port),
    ],
    {
      cwd: resolve('apps/admin'),
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        NODE_ENV: mode,
        CMS_API_BASE_URL: apiOrigin,
        CMS_ADMIN_ORIGIN: `http://127.0.0.1:${port}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

function nextProcess(options: NextProcessOptions) {
  const child = nextChild(options);
  let output = '';
  const record = (value: Buffer) => {
    output = (output + value.toString()).slice(-65536);
  };
  child.stdout.on('data', record);
  child.stderr.on('data', record);
  let stopped = false;
  const exited = new Promise<void>((done, reject) => {
    child.once('error', reject);
    child.once('exit', () => {
      stopped = true;
      done();
    });
  });
  const abort = () => child.kill('SIGTERM');
  options.signal?.addEventListener('abort', abort, { once: true });
  async function close() {
    options.signal?.removeEventListener('abort', abort);
    if (stopped) return;
    child.kill('SIGTERM');
    const timer = globalThis.setTimeout(() => child.kill('SIGKILL'), 15000);
    try {
      await exited;
    } finally {
      clearTimeout(timer);
    }
  }
  return { close, exited, stopped: () => stopped, output: () => output };
}

async function startNext(options: NextProcessOptions) {
  options.signal?.throwIfAborted();
  const server = nextProcess(options);
  try {
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      options.signal?.throwIfAborted();
      if (server.stopped()) throw new Error(`Next.js exited before ready: ${server.output()}`);
      const ready = await fetch(`http://127.0.0.1:${options.port}/ui`, {
        signal: AbortSignal.timeout(2000),
      }).catch(() => null);
      if (ready?.ok) return server;
      await Promise.race([setTimeout(100), server.exited]);
    }
    throw new Error(`Next.js startup timed out: ${server.output()}`);
  } catch (error) {
    await server.close();
    throw error;
  }
}

export async function createAdminApplicationProcess(
  mode: 'development' | 'production',
  port: number,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const origin = `http://127.0.0.1:${port}`;
  const cms = await createCmsProcess(mode === 'development' ? 'bun' : 'node', {
    frontendUrl: origin,
    navigationPaths: ['/dashboard'],
  });
  let next: Awaited<ReturnType<typeof startNext>> | undefined;
  async function close() {
    try {
      await next?.close();
    } finally {
      await cms.close();
    }
  }
  try {
    await seedAccounts(cms);
    const apiOrigin = `http://127.0.0.1:${cms.port()}`;
    next = await startNext({ mode, port, apiOrigin, signal });
    return { origin, apiOrigin, close };
  } catch (error) {
    await close();
    throw error;
  }
}
