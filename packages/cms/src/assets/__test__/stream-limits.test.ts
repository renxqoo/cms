import { expect, it } from 'vitest';
import { createCapacity } from '../uploads/capacity.ts';
import { readBytes } from '../uploads/read-bytes.ts';
import { digest, detectMime, validateRecipe, validateSettings } from '../validation.ts';
import { limits, stream } from './support.ts';

it('counts fragmented bytes without losing zero bytes or accepting a truncated body', async () => {
  const fragmented = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([0, 1]));
      controller.enqueue(new Uint8Array([2, 0]));
      controller.close();
    },
  });
  const bytes = await readBytes({
    stream: fragmented,
    maxBytes: 4,
    expectedBytes: 4,
    signal: AbortSignal.timeout(5000),
  });
  expect([...bytes]).toEqual([0, 1, 2, 0]);
  await expect(
    readBytes({
      stream: stream(new Uint8Array([1])),
      maxBytes: 4,
      expectedBytes: 2,
      signal: AbortSignal.timeout(5000),
    }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
  await expect(
    readBytes({ stream: stream(new Uint8Array()), maxBytes: 4, signal: AbortSignal.timeout(5000) }),
  ).rejects.toMatchObject({ code: 'invalid_input' });
});

it('cancels a waiting byte stream and releases its reader', async () => {
  let cancelled = false;
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const pending = readBytes({ stream: source, maxBytes: 4, signal: controller.signal });
  controller.abort();
  await expect(pending).rejects.toThrow(/./);
  expect(cancelled).toBe(true);
  expect(source.locked).toBe(false);
});

it('recognizes allowed magic bytes and rejects scripts regardless of a filename', () => {
  const cases = [
    [new Uint8Array([255, 216, 255, 0]), 'image/jpeg'],
    [new TextEncoder().encode('GIF89a..........'), 'image/gif'],
    [new TextEncoder().encode('RIFF1234WEBP....'), 'image/webp'],
  ] as const;
  for (const [bytes, mime] of cases) expect(detectMime(bytes)).toBe(mime);
  expect(() => detectMime(new TextEncoder().encode('<svg><script>bad</script></svg>'))).toThrow(
    'unsupported media type',
  );
  expect(digest(new TextEncoder().encode('abc'))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
});
it('accepts audio and video container signatures without trusting extensions or ambiguous RIFF/MP4 brands', () => {
  const wav = Buffer.alloc(44);
  wav.write('RIFF', 0);
  wav.writeUInt32LE(36, 4);
  wav.write('WAVE', 8);
  const mp4 = Buffer.alloc(24);
  mp4.writeUInt32BE(24, 0);
  mp4.write('ftyp', 4);
  mp4.write('isom', 8);
  for (const [bytes, mime] of [
    [wav, 'audio/wav'],
    [mp4, 'video/mp4'],
    [Buffer.from([255, 251, 144, 0]), 'audio/mpeg'],
  ] as const) {
    expect(detectMime(bytes)).toBe(mime);
    expect(() =>
      validateSettings({ maxBytes: 100, mimeTypes: [mime], recipe: { variants: [] } }, limits),
    ).not.toThrow();
  }
  const tagged = Buffer.concat([
    Buffer.from([73, 68, 51, 4, 0, 0, 0, 0, 0, 0]),
    Buffer.from([255, 251, 144, 0]),
  ]);
  expect(detectMime(tagged)).toBe('audio/mpeg');
  for (const bytes of [
    Buffer.from('RIFF1234AVI .....'),
    Buffer.from('0000ftypavif0000'),
    Buffer.from('ID3<script>'),
  ])
    expect(() => detectMime(bytes)).toThrow('unsupported media type');
});

it('rejects invalid configured MIME, bytes, duplicate variants and oversized recipes', () => {
  const settings = { maxBytes: 100, mimeTypes: ['image/png'], recipe: { variants: [] } };
  expect(() => validateSettings({ ...settings, maxBytes: 0 }, limits)).toThrow('invalid input');
  expect(() =>
    validateSettings({ ...settings, maxBytes: limits.maxUploadBytes + 1 }, limits),
  ).toThrow('invalid input');
  expect(() => validateSettings({ ...settings, mimeTypes: [] }, limits)).toThrow('invalid input');
  expect(() => validateSettings({ ...settings, mimeTypes: ['text/html'] }, limits)).toThrow(
    'invalid input',
  );
  const variant = {
    name: 'small',
    width: 10,
    height: 10,
    fit: 'cover' as const,
    format: 'png' as const,
    quality: 80,
  };
  expect(() => validateRecipe({ variants: [variant, variant] }, limits)).toThrow('invalid input');
  expect(() => validateRecipe({ variants: [{ ...variant, name: 'original' }] }, limits)).toThrow(
    'invalid input',
  );
  expect(() => validateRecipe({ variants: [variant] }, { ...limits, maxVariants: 0 })).toThrow(
    'invalid input',
  );
  expect(() =>
    validateRecipe({ variants: [{ ...variant, width: limits.maxWidth + 1 }] }, limits),
  ).toThrow('invalid input');
  expect(() => validateRecipe({ variants: [variant] }, { ...limits, maxPixels: 99 })).toThrow(
    'invalid input',
  );
});

it('bounds a capacity queue, admits on release, and rejects after close', async () => {
  const capacity = createCapacity({ concurrent: 1, queue: 1, timeoutMs: 1000 });
  const signal = AbortSignal.timeout(5000);
  let release: (() => void) | undefined;
  const first = capacity.run(
    signal,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let entered = false;
  const second = capacity.run(signal, () => {
    entered = true;
    return Promise.resolve('accepted');
  });
  await expect(capacity.run(signal, () => Promise.resolve())).rejects.toMatchObject({
    code: 'capacity_exceeded',
  });
  expect(entered).toBe(false);
  release?.();
  await first;
  expect(await second).toBe('accepted');
  await capacity.close();
  await expect(capacity.run(signal, () => Promise.resolve())).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
});

it('cancels queued admission, expires queue waits, and closes with active work', async () => {
  const capacity = createCapacity({ concurrent: 1, queue: 1, timeoutMs: 10 });
  const signal = AbortSignal.timeout(5000);
  let release: (() => void) | undefined;
  const first = capacity.run(
    signal,
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  const controller = new AbortController();
  const queued = capacity.run(controller.signal, () => Promise.resolve());
  controller.abort();
  await expect(queued).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  await expect(capacity.run(signal, () => Promise.resolve())).rejects.toMatchObject({
    code: 'temporarily_unavailable',
  });
  const last = capacity.run(signal, () => Promise.resolve());
  const closing = capacity.close();
  await expect(last).rejects.toMatchObject({ code: 'temporarily_unavailable' });
  release?.();
  await first;
  await closing;
});
