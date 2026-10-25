import { fail } from '@new-cms/cms/platform/contracts';

export async function readBytes(input: {
  stream: ReadableStream<Uint8Array>;
  maxBytes: number;
  expectedBytes?: number;
  signal: AbortSignal;
}): Promise<Uint8Array> {
  const reader = input.stream.getReader();
  const buffer = Buffer.allocUnsafe(input.maxBytes);
  let size = 0;
  const abort = () => {
    void reader.cancel(input.signal.reason).catch(() => {});
  };
  input.signal.addEventListener('abort', abort, { once: true });
  try {
    input.signal.throwIfAborted();
    while (true) {
      const next = await reader.read();
      input.signal.throwIfAborted();
      if (next.done) break;
      if (next.value.byteLength > input.maxBytes - size) fail('payload_too_large');
      buffer.set(next.value, size);
      size += next.value.byteLength;
    }
    if (size === 0 || (input.expectedBytes !== undefined && size !== input.expectedBytes))
      fail('invalid_input');
    return buffer.subarray(0, size);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    input.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}
