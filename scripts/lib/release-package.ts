import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { standaloneReleaseDeployFiles } from './release-deployment';

export interface ReleaseManifest {
  id: string;
  commit: string;
  builtAt: string;
  platform: NodeJS.Platform;
  arch: string;
  bunVersion: string;
  nodeMajor: 24;
  nodeVersion: '24.22.1';
}

interface ReleaseOptions {
  root: string;
  id: string;
  commit: string;
  bunVersion: string;
}

interface CopyContext {
  root: string;
  ancestors: Set<string>;
  excludeTests?: boolean;
}

const execute = promisify(execFile);
const privateNames = new Set(['.git', '.ssh', '.aws', '.npmrc', '.netrc', 'certs', 'secrets']);

export function validateReleaseId(id: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id))
    throw new Error('Release ID must match [A-Za-z0-9][A-Za-z0-9_-]{0,79}');
  return id;
}

export function isPrivateReleasePath(path: string) {
  return path.split(/[\\/]/).some((name) => {
    const lower = name.toLowerCase();
    return (
      privateNames.has(lower) ||
      lower === '.ds_store' ||
      lower === '.env' ||
      lower.startsWith('.env.') ||
      lower.endsWith('.env') ||
      /\.env\.(?!example$)/.test(lower) ||
      /\.(?:pem|key|p12|pfx|jks|keystore|crt|cer)$/.test(lower)
    );
  });
}

function confinedPath(root: string, path: string) {
  const local = relative(root, path);
  if (local === '..' || local.startsWith(`..${sep}`) || resolve(root, local) !== path)
    throw new Error(`Release dependency escapes the project: ${path}`);
  return local;
}

async function copyReleaseTree(source: string, target: string, context: CopyContext) {
  const localSource = relative(context.root, source);
  if (isPrivateReleasePath(localSource)) return;
  if (
    context.excludeTests &&
    localSource
      .split(sep)
      .some(
        (name) =>
          ['__test__', '__tests__', 'test', 'tests'].includes(name) ||
          /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(name),
      )
  )
    return;
  const actual = await realpath(source);
  const local = confinedPath(context.root, actual);
  if (isPrivateReleasePath(local))
    throw new Error(`Release symlink resolves to a private path: ${source}`);
  if (context.ancestors.has(actual)) throw new Error(`Cyclic release dependency: ${source}`);
  const info = await lstat(actual);
  if (info.isFile()) {
    await copyFile(actual, target);
    await chmod(target, info.mode & 0o755);
    return;
  }
  if (!info.isDirectory()) throw new Error(`Unsupported release file type: ${source}`);
  await mkdir(target, { recursive: true, mode: 0o755 });
  const ancestors = new Set([...context.ancestors, actual]);
  for (const name of await readdir(actual))
    await copyReleaseTree(join(actual, name), join(target, name), { ...context, ancestors });
}

export async function copyReleaseDirectory(
  source: string,
  target: string,
  options: { root: string; excludeTests?: boolean },
) {
  const root = await realpath(options.root);
  confinedPath(root, await realpath(source));
  await copyReleaseTree(source, target, {
    root,
    ancestors: new Set(),
    excludeTests: options.excludeTests,
  });
}

async function assertBuild(root: string) {
  try {
    await access(join(root, 'apps/api/dist/main.js'));
    const commands = await readdir(join(root, 'apps/api/dist/commands'));
    for (const required of ['migrate.js', 'initialize-admin.js', 'initialize-content.js'])
      if (!commands.includes(required)) throw new Error(`Missing ${required}`);
    await access(join(root, 'apps/admin/.next/standalone/server.js'));
    const build = await readFile(join(root, 'apps/admin/.next/BUILD_ID'), 'utf8');
    const standalone = await readFile(
      join(root, 'apps/admin/.next/standalone/.next/BUILD_ID'),
      'utf8',
    );
    if (!build.trim() || build !== standalone)
      throw new Error('The standalone build does not match the completed build');
    const staticInfo = await lstat(join(root, 'apps/admin/.next/static'));
    if (!staticInfo.isDirectory())
      throw new Error('The standalone build does not match the completed build');
  } catch {
    throw new Error('Run bun run build before packaging a complete production standalone output');
  }
}

async function stageExternals(root: string, runtime: string, context: CopyContext) {
  const externals = new Set();
  for (const name of ['pg', 'sharp', 'drizzle-orm', 'nodemailer', 'zod', 'hono', '@hono']) {
    externals.add(name);
  }
  const workspaceExternals = new Set(['@new-cms/cms', '@new-cms/database', '@new-cms/shared']);
  for (const entry of await readdir(join(root, 'node_modules'), { withFileTypes: true })) {
    if (!externals.has(entry.name) || workspaceExternals.has(entry.name)) continue;
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue;
    await copyReleaseTree(
      join(root, `node_modules/${entry.name}`),
      join(runtime, `node_modules/${entry.name}`),
      context,
    );
  }
  for (const entry of await readdir(join(root, 'node_modules/@hono'), { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    await copyReleaseTree(
      join(root, `node_modules/@hono/${entry.name}`),
      join(runtime, `node_modules/@hono/${entry.name}`),
      context,
    );
  }
}

async function stageRuntime(root: string, stage: string) {
  const runtime = join(stage, 'runtime');
  const context = { root, ancestors: new Set<string>() };
  await copyFile(join(root, 'deploy/supervisor.mjs'), join(runtime, 'supervisor.mjs'));
  await copyReleaseTree(join(root, 'apps/api/dist'), join(runtime, 'apps/api/dist'), context);
  await copyReleaseTree(
    join(root, 'apps/admin/.next/standalone'),
    join(runtime, 'apps/admin'),
    context,
  );
  for (const stale of ['.next/static', '.next/cache'])
    await rm(join(runtime, 'apps/admin', stale), { recursive: true, force: true });
  await copyReleaseTree(
    join(root, 'apps/admin/.next/static'),
    join(runtime, 'apps/admin/.next/static'),
    context,
  );
  const adminPublic = join(root, 'apps/admin/public');
  if (await lstat(adminPublic).catch(() => null))
    await copyReleaseTree(adminPublic, join(runtime, 'apps/admin/public'), context);
  await copyReleaseTree(
    join(root, 'node_modules/@new-cms'),
    join(runtime, 'node_modules/@new-cms'),
    context,
  );
  await stageExternals(root, runtime, context);
  await writeFile(
    join(runtime, 'package.json'),
    `${JSON.stringify({ name: 'new-cms-runtime', private: true, type: 'module' }, null, 2)}\n`,
  );
  for (const file of standaloneReleaseDeployFiles) {
    const target = join(stage, file);
    await mkdir(dirname(target), { recursive: true });
    await copyReleaseTree(join(root, file), target, context);
  }
}

export async function sha256File(path: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk))
      throw new Error('Unexpected file stream chunk');
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function assertNewArtifact(archive: string) {
  for (const path of [archive, `${archive}.sha256`]) {
    if (await lstat(path).catch(() => null)) throw new Error(`Refusing to overwrite ${path}`);
  }
}

function manifestFor(options: ReleaseOptions): ReleaseManifest {
  if (!/^[a-f0-9]{40,64}$/.test(options.commit)) throw new Error('Invalid release Git commit');
  return {
    id: validateReleaseId(options.id),
    commit: options.commit,
    builtAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    bunVersion: options.bunVersion,
    nodeMajor: 24,
    nodeVersion: '24.22.1',
  };
}

async function writeArtifact(stage: string, archive: string) {
  const temporary = join(stage, 'package.tar.gz');
  await execute('tar', ['-czf', temporary, '-C', stage, 'runtime', 'deploy', 'release.json'], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const digest = await sha256File(temporary);
  await copyFile(temporary, archive, constants.COPYFILE_EXCL);
  try {
    await writeFile(`${archive}.sha256`, `${digest}  ${basename(archive)}\n`, { flag: 'wx' });
  } catch (error) {
    await rm(archive, { force: true });
    throw error;
  }
}

export async function packageRelease(options: ReleaseOptions) {
  const manifest = manifestFor(options);
  const root = await realpath(options.root);
  await assertBuild(root);
  const output = join(root, 'output');
  const archive = join(output, `new-cms-${manifest.id}.tar.gz`);
  await mkdir(output, { recursive: true });
  await assertNewArtifact(archive);
  const stage = await mkdtemp(join(tmpdir(), 'oneaster-release-'));
  try {
    await stageRuntime(root, stage);
    await writeFile(join(stage, 'release.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeArtifact(stage, archive);
    return { archive, checksum: `${archive}.sha256`, manifest };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
