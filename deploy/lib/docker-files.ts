import { lstat, readlink, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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

export async function releaseLink(paths: { root: string }, name: string): Promise<string | null> {
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

export { withDeployLock } from './deploy-lock';
