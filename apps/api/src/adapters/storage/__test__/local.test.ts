import { mkdtemp, rm, symlink, mkdir, chmod, rename } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createLocalStorage } from '../local.ts';

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).toReversed()) await close();
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'cms-assets-local-'));
  const storage = createLocalStorage({ root });
  cleanups.push(
    () => rm(root, { recursive: true, force: true }),
    () => storage.close(),
  );
  return { root, storage };
}

it('stores immutable bytes, keeps them private and releases readable handles', async () => {
  const { storage } = await fixture();
  await storage.verify();
  const key = `objects/${randomUUID()}`;
  const bytes = new TextEncoder().encode('private bytes with a stable object identity');
  const signal = AbortSignal.timeout(5000);
  await storage.put({ key, bytes, mimeType: 'application/pdf', signal });
  expect(
    new Uint8Array(await new Response(await storage.read({ key, signal })).arrayBuffer()),
  ).toEqual(bytes);
  await expect(storage.put({ key, bytes, mimeType: 'application/pdf', signal })).rejects.toThrow(
    /./,
  );
  await storage.remove({ key, signal });
  await storage.remove({ key, signal });
  await expect(storage.read({ key, signal })).rejects.toThrow(/./);
});

it('rejects traversal, symlink objects, symlink roots and replaced roots', async () => {
  const { root, storage } = await fixture();
  await storage.verify();
  const signal = AbortSignal.timeout(5000);
  await expect(storage.read({ key: '../outside', signal })).rejects.toThrow('Invalid object key');
  const id = randomUUID();
  await symlink('/etc/passwd', join(root, id));
  await expect(storage.read({ key: `objects/${id}`, signal })).rejects.toThrow(/./);
  const alias = `${root}-alias`;
  await symlink(root, alias);
  cleanups.push(() => rm(alias, { force: true }));
  const linked = createLocalStorage({ root: alias });
  cleanups.push(() => linked.close());
  await expect(linked.verify()).rejects.toThrow('symbolic link');
  const retired = `${root}-retired`;
  await rename(root, retired);
  cleanups.push(() => rm(retired, { recursive: true, force: true }));
  await mkdir(root, { mode: 0o700 });
  await expect(storage.read({ key: `objects/${id}`, signal })).rejects.toThrow(
    'Storage root changed',
  );
});

it('cancels streams and closes idempotently', async () => {
  const { storage } = await fixture();
  const key = `objects/${randomUUID()}`;
  const controller = new AbortController();
  await storage.put({
    key,
    bytes: new Uint8Array([1, 2, 3]),
    mimeType: 'application/pdf',
    signal: controller.signal,
  });
  const stream = await storage.read({ key, signal: controller.signal });
  await stream.cancel();
  await storage.close();
  await storage.close();
  await expect(storage.read({ key, signal: controller.signal })).rejects.toThrow('closed');
});

it('regression: closing storage releases prefetched stream readers and shared abort listeners without consumer cancellation', async () => {
  const { root, storage } = await fixture();
  const key = `objects/${randomUUID()}`;
  const controller = new AbortController();
  await storage.put({
    key,
    bytes: new Uint8Array(1024),
    mimeType: 'application/pdf',
    signal: controller.signal,
  });
  for (let index = 0; index < 4; index++) {
    const instance = createLocalStorage({ root });
    const stream = await instance.read({ key, signal: controller.signal });
    try {
      for (let count = 0; count < 5; count++) await turn();
      await instance.close();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      const reader = stream.getReader();
      await expect(reader.closed).rejects.toThrow('Storage is closed');
      reader.releaseLock();
    } finally {
      await instance.close();
      await stream.cancel().catch(() => {});
    }
  }
});

it.each(['opening', 'started'])(
  'regression: rejects cancelled storage reads and releases stream ownership while %s',
  async (phase) => {
    const { storage } = await fixture();
    const key = `objects/${randomUUID()}`;
    await storage.put({
      key,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'application/pdf',
      signal: new AbortController().signal,
    });
    const controller = new AbortController();
    const reading = storage.read({ key, signal: controller.signal });
    if (phase === 'opening') controller.abort(new Error('Expected storage cancellation'));
    const stream = await reading;
    if (phase === 'started') controller.abort(new Error('Expected storage cancellation'));
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow(
      'Expected storage cancellation',
    );
    await storage.close();
  },
);

it('rejects shared roots, writable ancestors and nonprivate restored objects', async () => {
  const { root, storage } = await fixture();
  await storage.verify();
  const id = randomUUID();
  const key = `objects/${id}`;
  const signal = AbortSignal.timeout(5000);
  await storage.put({ key, bytes: new Uint8Array([1, 2, 3]), mimeType: 'application/pdf', signal });
  await chmod(join(root, id), 0o644);
  await expect(storage.read({ key, signal })).rejects.toThrow('Untrusted storage object');
  await chmod(root, 0o755);
  await expect(storage.verify()).rejects.toThrow('private');
  await chmod(root, 0o700);
  const ancestor = await mkdtemp(join(tmpdir(), 'cms-storage-shared-'));
  cleanups.push(() => rm(ancestor, { recursive: true, force: true }));
  await chmod(ancestor, 0o777);
  const insecure = createLocalStorage({ root: join(ancestor, 'root') });
  cleanups.push(() => insecure.close());
  await expect(insecure.verify()).rejects.toThrow('ancestors');
  await chmod(ancestor, 0o700);
});
