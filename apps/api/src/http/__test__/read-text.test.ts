import { expect, it } from 'vitest';
import { readText } from '../read-text.ts';

function streamed(source: UnderlyingSource<Uint8Array>) {
  const init: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    body: new ReadableStream(source),
    duplex: 'half',
  };
  return new Request('http://localhost/oauth/register', init);
}

it('reassembles split UTF-8 protocol text at the exact byte limit and unlocks the body', async () => {
  const text = '{"name":"中文🙂"}';
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const request = streamed({
    pull(controller) {
      if (offset === bytes.length) controller.close();
      else controller.enqueue(bytes.subarray(offset, ++offset));
    },
  });
  await expect(
    readText(request, { signal: new AbortController().signal, maxBytes: bytes.length }),
  ).resolves.toBe(text);
  expect(request.body?.locked).toBe(false);
});

it('rejects protocol body overflow using actual bytes and cancels the source', async () => {
  let cancelled = false;
  const request = streamed({
    start(controller) {
      controller.enqueue(new Uint8Array(9));
    },
    cancel() {
      cancelled = true;
    },
  });
  await expect(
    readText(request, { signal: new AbortController().signal, maxBytes: 8 }),
  ).rejects.toMatchObject({ code: 'payload_too_large' });
  expect(cancelled).toBe(true);
  expect(request.body?.locked).toBe(false);
});

it('aborts a stalled protocol body, cancels the source and releases its reader', async () => {
  let cancelled = false;
  const controller = new AbortController();
  const request = streamed({
    cancel() {
      cancelled = true;
    },
  });
  const pending = readText(request, { signal: controller.signal, maxBytes: 10 });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  expect(cancelled).toBe(true);
  expect(request.body?.locked).toBe(false);
  await expect(
    readText(new Request('http://localhost'), { signal: controller.signal, maxBytes: 10 }),
  ).rejects.toMatchObject({ code: 'temporarily_unavailable' });
});

it('reports malformed UTF-8, missing bodies and broken streams as invalid protocol input', async () => {
  const invalid = streamed({
    start(controller) {
      controller.enqueue(new Uint8Array([255]));
      controller.close();
    },
  });
  const broken = streamed({
    pull() {
      throw new Error('private stream failure');
    },
  });
  for (const request of [invalid, broken, new Request('http://localhost')])
    await expect(
      readText(request, { signal: new AbortController().signal, maxBytes: 10 }),
    ).rejects.toMatchObject({ code: 'invalid_input' });
});
