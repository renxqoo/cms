import 'server-only';
import { TransportError } from './errors';

export function assertBodyLength(headers: Headers, maximum: number): void {
  const length = headers.get('content-length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maximum))
    throw new TransportError('payload_too_large', 413);
}

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new TransportError('invalid_input', 400);
  }
}

export async function limitedJson(
  request: Request | Response,
  maximum: number,
  signal?: AbortSignal,
): Promise<unknown> {
  assertBodyLength(request.headers, maximum);
  if (!request.body) throw new TransportError('invalid_input', 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  function abort() {
    void reader.cancel(signal?.reason).catch(() => {});
  }
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) throw signal.reason;
    while (true) {
      const chunk = await reader.read();
      if (signal?.aborted) throw signal.reason;
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maximum) throw new TransportError('payload_too_large', 413);
      chunks.push(chunk.value);
    }
    const combined = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return decodeJson(combined);
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal?.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export async function assertEmptyBody(request: Request, signal: AbortSignal): Promise<void> {
  const length = request.headers.get('content-length');
  if (length !== null && !/^0+$/.test(length)) throw new TransportError('invalid_input', 400);
  if (request.body === null) return;
  const reader = request.body.getReader();
  function abort() {
    void reader.cancel(signal.reason).catch(() => {});
  }
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (signal.aborted) throw signal.reason;
    while (true) {
      const chunk = await reader.read();
      if (signal.aborted) throw signal.reason;
      if (chunk.done) break;
      if (chunk.value.byteLength > 0) throw new TransportError('invalid_input', 400);
    }
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

export async function discardRequestBody(request: Request): Promise<void> {
  if (request.body !== null && !request.body.locked) await request.body.cancel().catch(() => {});
}
