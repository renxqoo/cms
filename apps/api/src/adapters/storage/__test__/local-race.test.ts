import type * as FsPromises from 'node:fs/promises';
import { mkdtemp, mkdir, rename, symlink, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createLocalStorage } from '../local.ts';

const fault = vi.hoisted(() => ({ beforeOpen: undefined as (() => Promise<void>) | undefined }));
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  return {
    ...actual,
    async open(...args: Parameters<typeof actual.open>) {
      const trigger = fault.beforeOpen;
      fault.beforeOpen = undefined;
      await trigger?.();
      return actual.open(...args);
    },
  };
});
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  fault.beforeOpen = undefined;
  for (const close of cleanups.splice(0).toReversed()) await close();
});

it('rejects a root replaced between path validation and the actual open before exposing outside bytes', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cms-storage-race-'));
  const root = join(base, 'root');
  const outside = join(base, 'outside');
  const backup = join(base, 'backup');
  await mkdir(outside, { mode: 0o700 });
  const storage = createLocalStorage({ root });
  cleanups.push(
    () => rm(base, { recursive: true, force: true }),
    () => storage.close(),
  );
  const id = randomUUID();
  const key = `objects/${id}`;
  const signal = AbortSignal.timeout(5000);
  await storage.put({
    key,
    bytes: new TextEncoder().encode('inside authorized bytes'),
    mimeType: 'application/pdf',
    signal,
  });
  await writeFile(join(outside, id), 'outside private fixture bytes', { mode: 0o600 });
  fault.beforeOpen = async () => {
    await rename(root, backup);
    await symlink(outside, root);
  };
  const reading = storage.read({ key, signal }).then((body) => new Response(body).text());
  await expect(reading).rejects.toThrow('Storage root changed');
});
