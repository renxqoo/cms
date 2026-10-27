import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { HostPaths } from './system';

export async function atomicWrite(path: string, content: string, mode = 0o644): Promise<void> {
  const temporary = `${path}.${crypto.randomUUID()}`;
  try {
    await writeFile(temporary, content, { mode, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function switchLink(path: string, target: string | null): Promise<void> {
  const existing = await lstat(path).catch(() => null);
  if (existing && !existing.isSymbolicLink()) throw new Error(`${path} must be a release symlink`);
  if (!target) return rm(path, { force: true });
  const temporary = `${path}.${crypto.randomUUID()}`;
  try {
    await symlink(target, temporary);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function releaseLink(paths: HostPaths, name: string): Promise<string | null> {
  const path = join(paths.root, name);
  const info = await lstat(path).catch(() => null);
  if (!info) return null;
  if (!info.isSymbolicLink()) throw new Error(`${name} must be a release symlink`);
  const target = resolve(paths.root, await readlink(path));
  const id = target.slice(`${paths.root}/releases/`.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id) || target !== join(paths.root, 'releases', id))
    throw new Error(`Invalid ${name} release target`);
  const release = await lstat(target);
  if (!release.isDirectory() || release.isSymbolicLink())
    throw new Error(`Invalid ${name} release directory`);
  return target;
}

export async function assertPackageTree(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile()))
      throw new Error('Release packages must contain only regular files and directories');
    if (
      entry.name === '.env' ||
      entry.name.startsWith('.env.') ||
      /\.(pem|key|pfx|p12)$/.test(entry.name)
    )
      throw new Error('Release package contains a private environment or key file');
    if (entry.isDirectory()) await assertPackageTree(join(directory, entry.name));
  }
}

export async function readManifest(directory: string): Promise<{ id: string }> {
  const raw: unknown = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8'));
  if (
    typeof raw !== 'object' ||
    raw === null ||
    !('id' in raw) ||
    typeof raw.id !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(raw.id)
  )
    throw new Error('Invalid release metadata');
  const required = {
    platform: process.platform,
    arch: process.arch,
    nodeMajor: 24,
    nodeVersion: '24.22.1',
    bunVersion: '1.4.4',
  };
  if (Object.entries(required).some(([key, value]) => Reflect.get(raw, key) !== value))
    throw new Error(
      'Build the release with Bun 1.4.4 on the target Linux CPU architecture and Node.js 24.22.1',
    );
  return { id: raw.id };
}

export async function copyPackage(source: string, target: string): Promise<void> {
  await mkdir(target, { mode: 0o755 });
  try {
    for (const entry of ['runtime', 'deploy', 'release.json'])
      await cp(join(source, entry), join(target, entry), {
        recursive: true,
        dereference: false,
        preserveTimestamps: true,
      });
    await assertPackageTree(target);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

export { withDeployLock } from './deploy-lock';
