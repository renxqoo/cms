import { createHash } from 'node:crypto';
import { fail } from '@new-cms/cms/platform/contracts';

export function checkedStream(
  stream: ReadableStream<Uint8Array>,
  input: { bytes: number; digest: string; signal: AbortSignal },
) {
  let size = 0;
  const hash = createHash('sha256');
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        input.signal.throwIfAborted();
        size += chunk.byteLength;
        if (size > input.bytes) fail('invalid_input');
        hash.update(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        if (size !== input.bytes || hash.digest('hex') !== input.digest) fail('invalid_input');
      },
    }),
    { signal: input.signal },
  );
}
