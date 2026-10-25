import 'server-only';
import { TransportError } from './errors';

interface StreamOptions {
  maximum: number;
  highWaterMark: number;
  signal: AbortSignal;
  finish(): void;
  fail?(error: unknown): void;
}

interface StreamState {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  options: StreamOptions;
  bytes: number;
  ended: boolean;
  abort(this: void): void;
}

function finishStream(state: StreamState): void {
  if (state.ended) return;
  state.ended = true;
  state.options.signal.removeEventListener('abort', state.abort);
  state.options.finish();
}

async function cancelReader(state: StreamState, reason: unknown): Promise<void> {
  await state.reader.cancel(reason).catch(() => {});
  state.reader.releaseLock();
}

async function pullStream(
  state: StreamState,
  controller: ReadableStreamDefaultController<Uint8Array>,
): Promise<void> {
  try {
    const result = await state.reader.read();
    if (state.ended) return;
    if (result.done) {
      state.reader.releaseLock();
      finishStream(state);
      controller.close();
      return;
    }
    state.bytes += result.value.byteLength;
    if (state.bytes > state.options.maximum) throw new TransportError('payload_too_large', 413);
    controller.enqueue(result.value);
  } catch (error) {
    if (state.ended) return;
    finishStream(state);
    controller.error(error);
    state.options.fail?.(error);
    await cancelReader(state, error);
  }
}

export function limitedStream(
  stream: ReadableStream<Uint8Array>,
  options: StreamOptions,
): ReadableStream<Uint8Array> {
  let output: ReadableStreamDefaultController<Uint8Array>;
  const state: StreamState = {
    reader: stream.getReader(),
    options,
    bytes: 0,
    ended: false,
    abort() {
      if (state.ended) return;
      finishStream(state);
      output.error(options.signal.reason);
      void cancelReader(state, options.signal.reason);
    },
  };
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        output = controller;
        options.signal.addEventListener('abort', state.abort, { once: true });
        if (options.signal.aborted) state.abort();
      },
      pull: (controller) => pullStream(state, controller),
      async cancel(reason: unknown) {
        finishStream(state);
        options.fail?.(reason);
        await cancelReader(state, reason);
      },
    },
    { highWaterMark: options.highWaterMark, size: (chunk) => chunk.byteLength },
  );
}
