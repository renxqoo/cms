import { fail } from '@new-cms/cms/platform/contracts';
import type { ContentDeliveryOptions } from './types.ts';
import type { PublicExportFrame } from './contracts.ts';
import { canonicalJson } from './integrity.ts';
async function waitForWrite(
  write: (frame: Uint8Array) => Promise<void>,
  bytes: Uint8Array,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    await Promise.race([
      write(bytes),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason as unknown);
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}
export function createFrameWriter(
  options: ContentDeliveryOptions,
  input: { write: (frame: Uint8Array) => Promise<void>; signal: AbortSignal },
) {
  let bytes = 0;
  let failed = false;
  return {
    canWrite: () => !failed && !input.signal.aborted,
    async send(frame: PublicExportFrame) {
      const buffer = Buffer.from(`${canonicalJson(frame)}\n`);
      if (
        buffer.byteLength > options.policy.exportMaxFrameBytes ||
        bytes + buffer.byteLength > options.policy.exportMaxBytes
      )
        fail('capacity_exceeded');
      bytes += buffer.byteLength;
      try {
        await waitForWrite(
          input.write,
          buffer,
          AbortSignal.any([input.signal, AbortSignal.timeout(options.policy.exportWriteTimeoutMs)]),
        );
      } catch (error) {
        failed = true;
        throw error;
      }
      return buffer;
    },
  };
}
