import { expect, it } from 'vitest';
import { readJson } from '../read-json.ts';

function streamedRequest(source: UnderlyingSource<Uint8Array>) {
  const options: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body: new ReadableStream<Uint8Array>(source),
    duplex: 'half',
  };
  return new Request('http://localhost', options);
}

it('reassembles UTF-8 JSON split into single-byte chunks at the configured byte limit', async () => {
  const payload = new TextEncoder().encode(
    JSON.stringify({ name: '中文🙂', value: 'x'.repeat(4096) }),
  );
  let offset = 0;
  const request = streamedRequest({
    pull(controller) {
      if (offset === payload.length) controller.close();
      else controller.enqueue(payload.subarray(offset, ++offset));
    },
  });
  await expect(
    readJson(request, { signal: new AbortController().signal, maxBytes: payload.length }),
  ).resolves.toEqual({ name: '中文🙂', value: 'x'.repeat(4096) });
});

it('cancels the underlying body on overflow and reports actual bytes instead of trusting length headers', async () => {
  let cancelled = false;
  const request = streamedRequest({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"value":12}'));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    readJson(request, { signal: new AbortController().signal, maxBytes: 4 }),
  ).rejects.toMatchObject({ code: 'payload_too_large' });
  expect(cancelled).toBe(true);
});

it('aborts pending body reads, rejects invalid UTF-8 and releases the stream lock', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const request = streamedRequest({
    cancel() {
      cancelled = true;
    },
  });
  const result = readJson(request, { signal: controller.signal, maxBytes: 100 });
  controller.abort();
  await expect(result).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(cancelled).toBe(true);
  expect(request.body?.locked).toBe(false);
  const invalid = streamedRequest({
    start(stream) {
      stream.enqueue(new Uint8Array([255]));
      stream.close();
    },
  });
  await expect(
    readJson(invalid, { signal: new AbortController().signal, maxBytes: 100 }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    readJson(new Request('http://localhost'), { signal: controller.signal, maxBytes: 100 }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});
