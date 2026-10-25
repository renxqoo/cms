import { lstat, mkdir, realpath } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Stats } from 'node:fs';

export interface LocalDirectory {
  path: string;
  inode: number;
  device: number;
  uid: number;
  gid: number;
}

function identity() {
  if (!process.getuid || !process.getgid)
    throw new Error('Local storage requires POSIX ownership support');
  return { uid: process.getuid(), gid: process.getgid() };
}
function privateDirectory(stat: Stats): void {
  const owner = identity();
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== owner.uid ||
    stat.gid !== owner.gid ||
    (stat.mode & 0o777) !== 0o700
  )
    throw new Error('Storage root must be private and owned by the current process user and group');
}
async function trustedAncestors(path: string): Promise<void> {
  const owner = identity();
  let current = dirname(path);
  while (true) {
    const stat = await lstat(current);
    const writable = (stat.mode & 0o022) !== 0;
    const protectedTemporary = stat.uid === 0 && (stat.mode & 0o1000) !== 0;
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      ![0, owner.uid].includes(stat.uid) ||
      (writable && !protectedTemporary)
    )
      throw new Error('Storage ancestors must prevent replacement by other users');
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export function isMissing(error: unknown): boolean {
  return error !== null && typeof error === 'object' && 'code' in error && error.code === 'ENOENT';
}
export async function initializeDirectory(root: string): Promise<LocalDirectory> {
  const existing = await lstat(root).catch((error: unknown) => {
    if (isMissing(error)) return null;
    throw error;
  });
  if (existing?.isSymbolicLink()) throw new Error('Storage root cannot be a symbolic link');
  await mkdir(root, { recursive: true, mode: 0o700 });
  const stat = await lstat(root);
  privateDirectory(stat);
  const path = await realpath(root);
  await trustedAncestors(path);
  return { path, inode: stat.ino, device: stat.dev, uid: stat.uid, gid: stat.gid };
}
export async function assertStorageDirectory(
  directory: LocalDirectory,
  root: string,
): Promise<void> {
  const stats = await Promise.all([lstat(root), lstat(directory.path)]);
  for (const stat of stats) {
    if (stat.ino !== directory.inode || stat.dev !== directory.device || stat.isSymbolicLink())
      throw new Error('Storage root changed');
    privateDirectory(stat);
  }
  await trustedAncestors(directory.path);
}
export async function assertOpenedFile(input: {
  file: FileHandle;
  path: string;
  root: string;
  directory: LocalDirectory;
}): Promise<void> {
  await assertStorageDirectory(input.directory, input.root);
  const [file, path, canonical] = await Promise.all([
    input.file.stat(),
    lstat(input.path),
    realpath(input.path),
  ]);
  if (
    !file.isFile() ||
    !path.isFile() ||
    file.ino !== path.ino ||
    file.dev !== path.dev ||
    canonical !== input.path ||
    file.uid !== input.directory.uid ||
    file.gid !== input.directory.gid ||
    (file.mode & 0o077) !== 0
  )
    throw new Error('Untrusted storage object');
  await assertStorageDirectory(input.directory, input.root);
}
