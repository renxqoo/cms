import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import type { CliConfig } from './config.ts';

const storedSession = z.strictObject({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1).optional(),
  expiresAt: z.number().finite(),
  scope: z.string(),
});
export type StoredSession = z.infer<typeof storedSession>;
const lockOwner = z.object({ pid: z.number().int().positive(), nonce: z.string() });

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return !(error instanceof Error && 'code' in error && error.code === 'ESRCH');
  }
}

async function secureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw new Error('Unsafe credential directory');
  await chmod(path, 0o700);
}

export function createSessionStore(
  config: Pick<CliConfig, 'origin' | 'profile' | 'stateDir' | 'lockLimits'>,
) {
  const namespace = createHash('sha256')
    .update(`${config.origin}\0${config.profile}`)
    .digest('hex');
  const directory = join(config.stateDir, namespace);
  const path = join(directory, 'session.json');
  const lock = join(directory, 'refresh.lock');
  async function prepare() {
    await secureDirectory(config.stateDir);
    await secureDirectory(directory);
  }
  async function read(): Promise<StoredSession | null> {
    try {
      const stat = await lstat(path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
        throw new Error('Unsafe credential file');
      await chmod(path, 0o600);
      return storedSession.parse(JSON.parse(await readFile(path, 'utf8')) as unknown);
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
  async function write(value: StoredSession): Promise<void> {
    await prepare();
    await atomicWrite(path, storedSession.parse(value));
  }
  async function locked<T>(work: () => Promise<T>, signal: AbortSignal): Promise<T> {
    await prepare();
    const nonce = randomUUID();
    const waiting = AbortSignal.any([signal, AbortSignal.timeout(config.lockLimits.waitMs)]);
    await acquire({ lock, nonce, signal: waiting, limits: config.lockLimits });
    try {
      return await work();
    } finally {
      const owner = lockOwner.parse(JSON.parse(await readFile(lock, 'utf8')) as unknown);
      if (owner.nonce === nonce) await rm(lock, { force: true });
    }
  }
  return { read, write, clear: () => rm(path, { force: true }), locked, path, directory };
}

async function acquire(options: {
  lock: string;
  nonce: string;
  signal: AbortSignal;
  limits: CliConfig['lockLimits'];
}): Promise<void> {
  while (true) {
    options.signal.throwIfAborted();
    try {
      const file = await open(options.lock, 'wx', 0o600);
      try {
        await file.writeFile(JSON.stringify({ pid: process.pid, nonce: options.nonce }));
      } finally {
        await file.close();
      }
      return;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      await inspectLock(options.lock, options.limits.invalidGraceMs);
      await delay(options.limits.pollMs, undefined, { signal: options.signal });
    }
  }
}

async function inspectLock(path: string, invalidGraceMs: number): Promise<void> {
  try {
    const stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe credential lock');
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path, 'utf8')) as unknown;
    } catch {
      raw = null;
    }
    const owner = lockOwner.safeParse(raw);
    if (owner.success && !alive(owner.data.pid))
      throw new Error(`Stale credential lock: remove ${path} and log in again`);
    if (!owner.success && Date.now() - stat.mtimeMs > invalidGraceMs)
      throw new Error(`Invalid credential lock: remove ${path} and log in again`);
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

async function atomicWrite(path: string, value: StoredSession): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(value));
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
