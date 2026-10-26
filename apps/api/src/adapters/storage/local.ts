import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  initializeDirectory,
  assertStorageDirectory,
  assertOpenedFile,
  isMissing,
} from './local-directory.ts';
import type { LocalDirectory } from './local-directory.ts';
import { createLocalStream } from './local-stream.ts';
import type { StorageDriver } from '@new-cms/cms/assets/composition';

interface LocalRuntime {
  root: string;
  handles: Map<FileHandle, () => Promise<void>>;
  initialized?: Promise<LocalDirectory>;
  closed: boolean;
}
function objectName(key: string): string {
  if (!/^objects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(key))
    throw new Error('Invalid object key');
  return key.slice('objects/'.length);
}

async function objectPath(runtime: LocalRuntime, key: string): Promise<string> {
  if (runtime.closed) throw new Error('Storage is closed');
  const name = objectName(key);
  runtime.initialized ??= initializeDirectory(runtime.root);
  const directory = await runtime.initialized;
  await assertStorageDirectory(directory, runtime.root);
  return join(directory.path, name);
}
async function write(
  runtime: LocalRuntime,
  data: Parameters<StorageDriver['put']>[0],
): Promise<void> {
  data.signal.throwIfAborted();
  const path = await objectPath(runtime, data.key);
  const file = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o600,
  );
  if (runtime.closed) {
    await file.close();
    throw new Error('Storage is closed');
  }
  trackHandle(runtime, file);
  try {
    await verifyFile(runtime, file, path);
    await file.writeFile(data.bytes, { signal: data.signal });
    await file.sync();
  } finally {
    await file.close();
    runtime.handles.delete(file);
  }
}
async function read(runtime: LocalRuntime, data: Parameters<StorageDriver['read']>[0]) {
  data.signal.throwIfAborted();
  const path = await objectPath(runtime, data.key);
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  if (runtime.closed) {
    await file.close();
    throw new Error('Storage is closed');
  }
  trackHandle(runtime, file);
  try {
    await verifyFile(runtime, file, path);
    if (runtime.closed) throw new Error('Storage is closed');
    const owned = createLocalStream(file, {
      signal: data.signal,
      done: () => {
        runtime.handles.delete(file);
      },
    });
    runtime.handles.set(file, owned.close);
    return owned.stream;
  } catch (error) {
    await file.close();
    runtime.handles.delete(file);
    throw error;
  }
}
export function createLocalStorage(input: { root: string }): StorageDriver {
  const runtime: LocalRuntime = { root: resolve(input.root), handles: new Map(), closed: false };
  return {
    capabilities: { shared: false, directUpload: false, multipart: false, writeSettleMs: 0 },
    put: (data) => write(runtime, data),
    read: (data) => read(runtime, data),
    async remove(data) {
      data.signal.throwIfAborted();
      await unlink(await objectPath(runtime, data.key)).catch((error: unknown) => {
        if (!isMissing(error)) throw error;
      });
    },
    async verify(signal) {
      signal?.throwIfAborted();
      if (runtime.closed) throw new Error('Storage is closed');
      runtime.initialized ??= initializeDirectory(runtime.root);
      await runtime.initialized;
      await assertStorageDirectory(await runtime.initialized, runtime.root);
      signal?.throwIfAborted();
    },
    close: () => closeStorage(runtime),
  };
}

function trackHandle(runtime: LocalRuntime, file: FileHandle) {
  runtime.handles.set(file, async () => {
    await file.close();
    runtime.handles.delete(file);
  });
}

async function closeStorage(runtime: LocalRuntime) {
  runtime.closed = true;
  await runtime.initialized?.catch(() => {});
  const results = await Promise.allSettled(
    [...runtime.handles.values()].map((release) => release()),
  );
  const errors: unknown[] = [];
  for (const result of results) if (result.status === 'rejected') errors.push(result.reason);
  if (errors.length > 0)
    throw new AggregateError(errors, 'Local storage could not close all resources');
}
async function verifyFile(runtime: LocalRuntime, file: FileHandle, path: string): Promise<void> {
  runtime.initialized ??= initializeDirectory(runtime.root);
  await assertOpenedFile({ file, path, root: runtime.root, directory: await runtime.initialized });
}
