import { CmsError } from '@new-cms/cms/platform/contracts';

export async function readText(
  request: Request,
  options: { signal: AbortSignal; maxBytes: number },
): Promise<string> {
  if (options.signal.aborted) throw new CmsError('temporarily_unavailable');
  if (!request.body) throw new CmsError('invalid_input');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  options.signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      const { value, done } = await reader.read();
      options.signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > options.maxBytes) throw new CmsError('payload_too_large');
      chunks.push(value);
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, size));
  } catch (error) {
    if (options.signal.aborted) throw new CmsError('temporarily_unavailable');
    if (error instanceof CmsError) throw error;
    throw new CmsError('invalid_input');
  } finally {
    options.signal.removeEventListener('abort', cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
