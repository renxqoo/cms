import { Archive, file, sleep, spawn } from 'bun';
import { z } from 'zod';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPrivateReleasePath, sha256File } from './release-package';
import type { ReleaseManifest } from './release-package';

interface ProcessHandle {
  process: ReturnType<typeof spawn>;
  output: () => string;
  captured: Promise<unknown>;
}

export async function verifyArtifactChecksum(path: string) {
  const expected = await readFile(`${path}.sha256`, 'utf8');
  const digest = await sha256File(path);
  if (expected !== `${digest}  ${basename(path)}\n`)
    throw new Error('Release archive SHA-256 does not match its sidecar');
}

async function assertExtractedTree(directory: string, prefix = '') {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const local = prefix ? `${prefix}/${name}` : name;
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()))
      throw new Error(`Unsupported release entry: ${local}`);
    if (isPrivateReleasePath(local)) throw new Error(`Private release entry: ${local}`);
    if (info.isDirectory()) await assertExtractedTree(path, local);
  }
}

function parseManifest(value: unknown): ReleaseManifest {
  return z
    .strictObject({
      id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/),
      commit: z.string().regex(/^[a-f0-9]{40,64}$/),
      builtAt: z.iso.datetime(),
      platform: z.literal(process.platform),
      arch: z.literal(process.arch),
      bunVersion: z.string(),
      nodeMajor: z.literal(24),
      nodeVersion: z.literal('24.22.1'),
    })
    .parse(value);
}

async function extractRelease(path: string, directory: string) {
  await verifyArtifactChecksum(path);
  const archive = new Archive(await file(path).bytes());
  await archive.extract(directory);
  const entries = await readdir(directory);
  if (
    entries.length !== 3 ||
    !['deploy', 'release.json', 'runtime'].every((entry) => entries.includes(entry))
  )
    throw new Error('Release archive must contain runtime/, deploy/ and release.json');
  await assertExtractedTree(directory);
  const manifest = parseManifest(
    JSON.parse(await readFile(join(directory, 'release.json'), 'utf8')),
  );
  if (basename(path) !== `new-cms-${manifest.id}.tar.gz`)
    throw new Error('Release archive filename does not match its manifest ID');
}

function nodeRuntime() {
  const node = Bun.which('node');
  if (!node) throw new Error('Install Node.js 24.22.1 before verifying the production release');
  const result = execFileSync(
    node,
    [
      '-p',
      "process.release.name === 'node' && !process.versions.bun && process.versions.node === '24.22.1'",
    ],
    { encoding: 'utf8', env: { PATH: process.env.PATH, NODE_ENV: 'production' } },
  );
  if (result.trim() !== 'true')
    throw new Error('Release verification requires the real Node.js 24.22.1 runtime');
  return node;
}

function startProcess(node: string, runtime: string, env: Record<string, string>) {
  let output = '';
  const child = spawn([node, 'supervisor.mjs'], {
    cwd: runtime,
    env: { PATH: process.env.PATH, HOME: runtime, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  async function capture(stream: ReadableStream<Uint8Array>) {
    for await (const chunk of stream)
      output = `${output}${new TextDecoder().decode(chunk)}`.slice(-50_000);
  }
  return {
    process: child,
    output: () => output,
    captured: Promise.all([capture(child.stdout), capture(child.stderr)]),
  };
}

async function stopProcess(app: ProcessHandle) {
  if (app.process.exitCode === null) app.process.kill('SIGTERM');
  const timer = setTimeout(() => app.process.kill('SIGKILL'), 35_000);
  try {
    await app.process.exited;
    await app.captured;
  } finally {
    clearTimeout(timer);
  }
}

interface PostgresHandle {
  url: string;
  stop: () => Promise<void>;
}

async function startLocalPostgres(): Promise<PostgresHandle> {
  const initdb = Bun.which('initdb');
  const pgctl = Bun.which('pg_ctl');
  if (!initdb || !pgctl)
    throw new Error('Release verification requires PostgreSQL binaries (initdb, pg_ctl)');
  const data = await mkdtemp(join(tmpdir(), 'new-cms-verify-pg-'));
  const socket = await mkdtemp(join(tmpdir(), 'new-cms-verify-sock-'));
  await run([initdb, '-D', data, '--auth=trust', '--no-sync']);
  const port = 20000 + Math.floor(Math.random() * 20000);
  await run([
    pgctl,
    '-D',
    data,
    '-o',
    `-p ${port} -k ${socket} -c listen_addresses=127.0.0.1 -c fsync=off`,
    '-w',
    'start',
  ]);
  return {
    url: `postgresql://postgres@127.0.0.1:${port}/postgres`,
    stop: async () => {
      await run([pgctl, '-D', data, '-m', 'immediate', 'stop']).catch(() => null);
      await Promise.all([
        rm(data, { recursive: true, force: true }),
        rm(socket, { recursive: true, force: true }),
      ]);
    },
  };
}

async function run(command: string[]) {
  const child = spawn(command, { stdout: 'pipe', stderr: 'pipe' });
  const [output, errors, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) throw new Error(`${command[0]} failed: ${errors || output}`);
  return output;
}

async function waitForService(origin: string, path: string, app: ProcessHandle) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (app.process.exitCode !== null) throw new Error(`Release exited early: ${app.output()}`);
    const response = await fetch(`${origin}${path}`, {
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);
    if (response?.status === 200) return;
    await sleep(300);
  }
  throw new Error(`Release service did not become live at ${path}: ${app.output()}`);
}

async function expectResponse(origin: string, path: string, status = 200) {
  const response = await fetch(`${origin}${path}`, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status !== status)
    throw new Error(`Release ${path} returned ${response.status}, expected ${status}`);
  return response;
}

export async function verifyReleaseResponses(apiOrigin: string, adminOrigin: string) {
  const live = await expectResponse(apiOrigin, '/livez');
  const body: unknown = await live.json();
  if (typeof body !== 'object' || body === null || Reflect.get(body, 'status') !== 'ok')
    throw new Error('API liveness did not report status=ok');
  const ready = await expectResponse(apiOrigin, '/readyz');
  const readyBody: unknown = await ready.json();
  if (
    typeof readyBody !== 'object' ||
    readyBody === null ||
    Reflect.get(readyBody, 'status') !== 'ready'
  )
    throw new Error('API readiness did not report status=ready');
  const admin = await expectResponse(adminOrigin, '/login');
  const html = await admin.text();
  if (!html.includes('<!DOCTYPE html>') && !html.includes('<html'))
    throw new Error('Admin login page did not render HTML');
}

async function verifyRuntime(directory: string, node: string) {
  const runtime = join(directory, 'runtime');
  const postgres = await startLocalPostgres();
  let app: ProcessHandle | undefined;
  try {
    const apiOrigin = 'http://127.0.0.1:9091';
    const adminOrigin = 'http://127.0.0.1:9092';
    app = startProcess(node, runtime, {
      NODE_ENV: 'test',
      API_HOST: '127.0.0.1',
      API_PORT: '9091',
      ADMIN_PORT: '9092',
      DATABASE_URL: postgres.url,
      CMS_MIGRATION_DATABASE_URL: postgres.url,
      DATABASE_SCHEMA: 'public',
      CMS_RATE_LIMIT_SECRET: 'release-verification-rate-limit-secret-32ch',
      CMS_FRONTEND_URL: adminOrigin,
      CMS_ADMIN_ORIGIN: adminOrigin,
      CMS_API_BASE_URL: apiOrigin,
      ONEASTER_CLIENT_ORIGIN: 'http://127.0.0.1:9090',
      CMS_STORAGE_DRIVER: 'local',
      CMS_STORAGE_ROOT: join(runtime, '.data/assets'),
    });
    await waitForService(apiOrigin, '/livez', app);
    await verifyReleaseResponses(apiOrigin, adminOrigin);
  } catch (error) {
    if (app) console.error(app.output());
    throw error;
  } finally {
    try {
      if (app) await stopProcess(app);
    } finally {
      await postgres.stop();
    }
  }
}

export async function verifyReleaseArchive(archivePath: string) {
  if (process.getuid?.() === 0) throw new Error('Verify release archives as an unprivileged user');
  const node = nodeRuntime();
  const directory = await mkdtemp(join(tmpdir(), 'new-cms-verify-release-'));
  try {
    await extractRelease(archivePath, directory);
    await verifyRuntime(directory, node);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export { copyFile, chmod, mkdir, writeFile, fileURLToPath };
