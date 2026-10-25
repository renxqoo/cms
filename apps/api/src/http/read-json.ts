import { CmsError } from '@new-cms/cms/platform/contracts';

export async function readJson(
  request: Request,
  options: { signal: AbortSignal; maxBytes: number },
): Promise<unknown> {
  if (options.signal.aborted) throw new CmsError('temporarily_unavailable');
  if (!request.body) throw new CmsError('invalid_input');
  const reader = request.body.getReader();
  const bytes = Buffer.alloc(options.maxBytes);
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
      if (size + value.byteLength > options.maxBytes) throw new CmsError('payload_too_large');
      bytes.set(value, size);
      size += value.byteLength;
    }
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, size));
    const parsed: unknown = JSON.parse(text);
    return parsed;
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
