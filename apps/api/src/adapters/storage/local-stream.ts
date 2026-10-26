import type { FileHandle } from 'node:fs/promises';

interface LocalStream {
  file: FileHandle;
  reader: Pick<ReadableStreamDefaultReader<unknown>, 'read' | 'cancel' | 'releaseLock'>;
  signal: AbortSignal;
  done: () => void;
  abort: () => void;
  closing: Promise<void> | null;
  controller: ReadableStreamDefaultController<Uint8Array> | null;
}

async function release(state: LocalStream, reason?: unknown) {
  state.signal.removeEventListener('abort', state.abort);
  try {
    await state.reader.cancel(reason);
  } finally {
    await state.file.close();
    state.reader.releaseLock();
    state.done();
  }
}

function close(state: LocalStream, reason?: unknown) {
  state.closing ??= release(state, reason);
  return state.closing;
}

async function pull(state: LocalStream, controller: ReadableStreamDefaultController<Uint8Array>) {
  try {
    state.signal.throwIfAborted();
    const next = await state.reader.read();
    state.signal.throwIfAborted();
    const value: unknown = next.value;
    if (next.done) {
      await close(state);
      controller.close();
    } else if (value instanceof Uint8Array) controller.enqueue(value);
    else if (value instanceof ArrayBuffer) controller.enqueue(new Uint8Array(value));
    else throw new Error('Invalid storage stream');
  } catch (error) {
    try {
      await close(state, error);
    } catch (cleanupError) {
      controller.error(cleanupError);
      return;
    }
    controller.error(error);
  }
}

export function createLocalStream(
  file: FileHandle,
  input: { signal: AbortSignal; done: () => void },
) {
  const state: LocalStream = {
    file,
    reader: file.readableWebStream({ autoClose: true }).getReader(),
    ...input,
    closing: null,
    controller: null,
    abort: () => {
      void close(state, input.signal.reason).catch(() => {});
    },
  };
  input.signal.addEventListener('abort', state.abort, { once: true });
  if (input.signal.aborted) state.abort();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      state.controller = controller;
    },
    pull: (controller) => pull(state, controller),
    cancel: (reason) => close(state, reason),
  });
  return {
    stream,
    close(this: void) {
      const reason = new Error('Storage is closed');
      state.controller?.error(reason);
      return close(state, reason);
    },
  };
}
