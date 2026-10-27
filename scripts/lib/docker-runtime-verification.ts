import { sleep } from 'bun';
import type { DockerCommand } from './docker-release';

interface VerificationOptions {
  image: string;
  verificationImage: string;
  runDocker: DockerCommand;
}

const fixtureProgram = `
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const run = promisify(execFile);
const data = await mkdtemp(join(tmpdir(), 'cms-fixture-pg-'));
const socket = await mkdtemp(join(tmpdir(), 'cms-fixture-sock-'));
await run('initdb', ['-D', data, '--auth=trust', '--no-sync']);
const port = 30000 + Math.floor(Math.random() * 20000);
await run('pg_ctl', ['-D', data, '-o', \`-p \${port} -k \${socket} -c listen_addresses=127.0.0.1 -c fsync=off\`, '-w', 'start']);
console.log(JSON.stringify({ databaseUrl: \`postgresql://postgres@127.0.0.1:\${port}/postgres\` }));
const stop = async () => { try { await run('pg_ctl', ['-D', data, '-m', 'immediate', 'stop']); } catch {} process.exit(0); };
process.on('SIGTERM', stop);
await new Promise(() => {});
`;

async function remove(runDocker: DockerCommand, name: string) {
  try {
    await runDocker(['rm', '--force', name], { cleanup: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes('No such container')) return;
    throw error;
  }
}

async function fixtureReady(runDocker: DockerCommand, name: string): Promise<string> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const logs = await runDocker(['logs', name]);
    if (logs.trim()) {
      const value: unknown = JSON.parse(logs.trim());
      const url =
        typeof value === 'object' && value !== null && 'databaseUrl' in value
          ? String(Reflect.get(value, 'databaseUrl'))
          : '';
      if (!/^postgresql:\/\/postgres@127\.0\.0\.1:\d+\/postgres$/.test(url))
        throw new Error('Docker fixture database URL is malformed');
      return url;
    }
    await sleep(200);
  }
  throw new Error('Isolated Docker PostgreSQL fixture did not start');
}

async function runtimeReady(options: VerificationOptions, network: string) {
  const program = `
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const live = await fetch('http://127.0.0.1:9091/livez', { signal: AbortSignal.timeout(2000) }).catch(() => null);
  const admin = await fetch('http://127.0.0.1:9092/login', { redirect: 'manual', signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (live?.status === 200 && admin?.status === 200) process.exit(0);
  await Bun.sleep(500);
}
console.error('services did not become healthy');
process.exit(1);`;
  const deadline = Date.now() + 150_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      await options.runDocker(['exec', network, 'bun', '--eval', program]);
      return;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw new Error('Final Docker runtime did not pass API and admin health checks', {
    cause: lastError,
  });
}

async function verifyRuntime(
  options: VerificationOptions,
  databaseUrl: string,
  containers: { fixture: string; runtime: string },
) {
  const env = {
    NODE_ENV: 'test',
    API_HOST: '127.0.0.1',
    API_PORT: '9091',
    ADMIN_PORT: '9092',
    DATABASE_URL: databaseUrl,
    CMS_MIGRATION_DATABASE_URL: databaseUrl,
    DATABASE_SCHEMA: 'public',
    CMS_RATE_LIMIT_SECRET: 'docker-runtime-verification-secret-32ch',
    CMS_FRONTEND_URL: 'http://127.0.0.1:9092',
    CMS_ADMIN_ORIGIN: 'http://127.0.0.1:9092',
    CMS_API_BASE_URL: 'http://127.0.0.1:9091',
    ONEASTER_CLIENT_ORIGIN: 'http://127.0.0.1:9090',
    CMS_STORAGE_DRIVER: 'local',
    CMS_STORAGE_ROOT: '/tmp/cms-assets',
  };
  await options.runDocker([
    'create',
    '--name',
    containers.runtime,
    '--init',
    '--network',
    `container:${containers.fixture}`,
    ...Object.entries(env).flatMap(([key, value]) => ['--env', `${key}=${value}`]),
    options.image,
  ]);
  await options.runDocker(['start', containers.runtime]);
  const version = await options.runDocker(['exec', containers.runtime, 'node', '--version']);
  if (version.trim() !== 'v24.22.1')
    throw new Error(`Final Docker image requires Node.js v24.22.1, got ${version}`);
  await runtimeReady(options, containers.fixture);
}

export async function verifyDockerRuntime(options: VerificationOptions) {
  const uuid = crypto.randomUUID();
  const fixture = `new-cms-image-fixture-${uuid}`;
  const runtime = `new-cms-image-runtime-${uuid}`;
  const failures: unknown[] = [];
  try {
    await options.runDocker([
      'create',
      '--name',
      fixture,
      '--init',
      '--network',
      'none',
      options.verificationImage,
      'bun',
      '--eval',
      fixtureProgram,
    ]);
    await options.runDocker(['start', fixture]);
    const databaseUrl = await fixtureReady(options.runDocker, fixture);
    await verifyRuntime(options, databaseUrl, { fixture, runtime });
  } catch (error) {
    failures.push(error);
  }
  const results = await Promise.allSettled([
    remove(options.runDocker, runtime),
    remove(options.runDocker, fixture),
  ]);
  for (const result of results) if (result.status === 'rejected') failures.push(result.reason);
  if (failures.length > 0) throw failures[0];
}
