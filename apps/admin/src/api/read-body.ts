import { requestPolicy } from './config';

export async function readResponseBytes(response: Response, maximum: number) {
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    await response.body?.cancel();
    throw new Error('Invalid response size');
  }
  const reader = response.body?.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  if (!reader) return chunks;
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) {
        complete = true;
        return chunks;
      }
      total += item.value.byteLength;
      if (total > maximum) throw new Error('Invalid response size');
      for (let offset = 0; offset < item.value.byteLength; offset += requestPolicy.streamHighWaterMark)
        chunks.push(Uint8Array.from(item.value.subarray(offset, offset + requestPolicy.streamHighWaterMark)));
    }
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function readResponseJson(response: Response): Promise<unknown> {
  const chunks = await readResponseBytes(response, requestPolicy.jsonResponseBytes);
  return JSON.parse(await new Blob(chunks).text());
}
