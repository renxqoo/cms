import { dlopen, read } from 'bun:ffi';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { constants as systemConstants } from 'node:os';

const library = process.platform === 'darwin' ? '/usr/lib/libSystem.B.dylib' : 'libc.so.6';
const errnoSymbol = process.platform === 'darwin' ? '__error' : '__errno_location';
const native = dlopen(library, {
  flock: { args: ['i32', 'i32'], returns: 'i32' },
  [errnoSymbol]: { args: [], returns: 'ptr' },
});

async function openLock(path: string): Promise<FileHandle> {
  const existing = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (existing)
    throw new Error(
      'A legacy deployment lock exists; confirm its owner has exited before explicit migration',
    );
  const file = await open(
    `${path}.flock`,
    constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    const info = await file.stat();
    if (
      !info.isFile() ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o777) !== 0o600 ||
      info.nlink !== 1
    )
      throw new Error(
        'Deployment lock must be a private regular file owned by the deployment user',
      );
    return file;
  } catch (error) {
    await file.close();
    throw error;
  }
}

async function acquire(path: string): Promise<FileHandle | null> {
  const file = await openLock(path);
  if (native.symbols.flock(file.fd, 2 | 4) === 0) return file;
  const pointer = native.symbols[errnoSymbol]();
  const code = pointer === null ? -1 : read.i32(pointer);
  await file.close();
  if (code === systemConstants.errno.EAGAIN || code === systemConstants.errno.EWOULDBLOCK)
    return null;
  throw new Error(`Cannot acquire deployment kernel lock (${code})`);
}

export async function skipBusyDeployLock(
  paths: { lock: string },
  action: () => Promise<void>,
): Promise<void> {
  const file = await acquire(paths.lock);
  if (!file) return;
  try {
    await file.truncate(0);
    await file.writeFile(`${process.pid}\n`);
    await action();
  } finally {
    await file.close();
  }
}

export async function withDeployLock<T>(
  paths: { lock: string },
  action: () => Promise<T>,
): Promise<T> {
  const file = await acquire(paths.lock);
  if (!file) throw new Error(`Another deployment holds ${paths.lock}`);
  try {
    await file.truncate(0);
    await file.writeFile(`${process.pid}\n`);
    return await action();
  } finally {
    await file.close();
  }
}
