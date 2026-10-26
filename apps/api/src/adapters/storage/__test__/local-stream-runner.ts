import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getEventListeners } from 'node:events';
import { setImmediate as turn } from 'node:timers/promises';
import { createLocalStorage } from '../local.ts';

const [, , mode, root] = process.argv;
if (!root) throw new Error('The storage lifecycle runner requires a parent-owned temporary root.');
const storage = createLocalStorage({ root });
const key = `objects/${randomUUID()}`;
const bytes = new Uint8Array([11, 22, 33, 44]);
const { gc } = global;
if (!gc) throw new Error('The storage lifecycle runner requires exposed garbage collection.');
try {
  await storage.put({
    key,
    bytes,
    mimeType: 'application/pdf',
    signal: new AbortController().signal,
  });
  if (mode === 'prefetched-shutdown') await verifyPrefetchedShutdown(root);
  else
    for (let index = 0; index < 20; index++) {
      const controller = new AbortController();
      const reading = storage.read({ key, signal: controller.signal });
      if (mode === 'abort-opening') controller.abort(new Error('Expected stream cancellation'));
      const stream = await reading;
      if (mode === 'abort-start') controller.abort(new Error('Expected stream cancellation'));
      if (mode === 'abort-opening' || mode === 'abort-start') {
        await assert.rejects(new Response(stream).arrayBuffer(), /Expected stream cancellation/);
      } else if (mode === 'cancel') await stream.cancel('Expected consumer cancellation');
      else if (mode === 'shutdown') {
        await storage.close();
        break;
      } else assert.deepEqual(new Uint8Array(await new Response(stream).arrayBuffer()), bytes);
    }
  await storage.close();
  await storage.close();
  for (let index = 0; index < 30; index++) {
    gc();
    await turn();
  }
  process.stdout.write(`Closed stream ownership: ${mode}\n`);
} finally {
  await storage.close();
}

async function verifyPrefetchedShutdown(storageRoot: string) {
  const controller = new AbortController();
  for (let index = 0; index < 4; index++) {
    const instance = createLocalStorage({ root: storageRoot });
    const stream = await instance.read({ key, signal: controller.signal });
    try {
      for (let count = 0; count < 5; count++) await turn();
      await instance.close();
      assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
      const reader = stream.getReader();
      await assert.rejects(reader.closed, /Storage is closed/);
      reader.releaseLock();
    } finally {
      await instance.close();
      await stream.cancel().catch(() => {});
    }
  }
}
