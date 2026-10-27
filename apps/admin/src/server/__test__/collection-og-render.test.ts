import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { renderCollectionOG } from '../collection-og-render';
import { collectionOGPolicy } from '../collection-og-policy';
const state = vi.hoisted(() => ({
  workers: [] as {
    emit: (event: string, value?: unknown) => boolean;
    terminate: ReturnType<typeof vi.fn<() => Promise<number>>>;
    listenerCount: (event: string) => number;
  }[],
}));
vi.mock('node:worker_threads', () => ({
  Worker: class extends EventEmitter {
    terminate = vi.fn<() => Promise<number>>().mockResolvedValue(0);
    constructor() {
      super();
      state.workers.push(this);
    }
  },
}));
beforeEach(() => {
  state.workers.length = 0;
});
const input = (signal = new AbortController().signal) => ({
  title: 'Private',
  description: 'Authorized',
  brand: 'CMS',
  signal,
});
it('already cancelled requests do not allocate a render worker', async () => {
  const abort = new AbortController();
  abort.abort();
  expect((await renderCollectionOG(input(abort.signal))).status).toBe(503);
  expect(state.workers).toHaveLength(0);
});
it.each([
  new ArrayBuffer(0),
  new ArrayBuffer(collectionOGPolicy.maxImageBytes + 1),
  'not image bytes',
])('invalid worker responses fail closed and release listeners: %s', async (value) => {
  const result = renderCollectionOG(input());
  state.workers[0]?.emit('message', value);
  expect((await result).status).toBe(503);
  expect(state.workers[0]?.listenerCount('message')).toBe(0);
});
it('a successful image waits for worker termination and ignores late events', async () => {
  const result = renderCollectionOG(input());
  const [worker] = state.workers;
  let release: ((code: number) => void) | undefined;
  worker?.terminate.mockImplementation(
    () =>
      new Promise((done) => {
        release = done;
      }),
  );
  worker?.emit('message', new Uint8Array([137, 80, 78, 71]).buffer);
  worker?.emit('error', new Error('Late event'));
  release?.(0);
  const response = await result;
  expect(response.status).toBe(200);
  expect(response.headers.get('content-length')).toBe('4');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([137, 80, 78, 71]));
  expect(worker?.listenerCount('error')).toBe(0);
});
it.each(['error', 'exit'])(
  'worker %s settles as unavailable without leaking listeners',
  async (event) => {
    const result = renderCollectionOG(input());
    state.workers[0]?.emit(event, event === 'error' ? new Error('Renderer unavailable') : 1);
    expect((await result).status).toBe(503);
    expect(state.workers[0]?.listenerCount('error')).toBe(0);
  },
);
it('termination failures cannot return a private successful response', async () => {
  const result = renderCollectionOG(input());
  state.workers[0]?.terminate.mockRejectedValue(new Error('Termination failed'));
  state.workers[0]?.emit('message', new ArrayBuffer(1));
  expect((await result).status).toBe(503);
  expect(state.workers[0]?.listenerCount('message')).toBe(0);
});
it('cancellation terminates pending rendering and removes the abort listener', async () => {
  const abort = new AbortController();
  const removed = vi.spyOn(abort.signal, 'removeEventListener');
  const result = renderCollectionOG(input(abort.signal));
  abort.abort();
  expect((await result).status).toBe(503);
  expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
  expect(state.workers[0]?.listenerCount('exit')).toBe(0);
});
