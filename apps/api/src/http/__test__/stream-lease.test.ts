import { expect, it } from 'vitest';
import { leaseStream } from '../stream-lease.ts';

it('keeps the lease until the last byte is read and releases exactly once', async () => {
  let releases = 0;
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.close();
    },
  });
  const controller = new AbortController();
  const stream = leaseStream(source, {
    signal: controller.signal,
    finish: () => {
      releases += 1;
    },
  });
  expect(releases).toBe(0);
  expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(releases).toBe(1);
  controller.abort();
  expect(releases).toBe(1);
});

it('deadline cancellation reaches the source and returns capacity even with a stalled reader', async () => {
  let cancelled = false;
  let releases = 0;
  const source = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const controller = new AbortController();
  const stream = leaseStream(source, {
    signal: controller.signal,
    finish: () => {
      releases += 1;
    },
  });
  const read = stream.getReader().read();
  controller.abort(new Error('Stream deadline'));
  await expect(read).rejects.toThrow('Stream deadline');
  await Promise.resolve();
  expect(cancelled).toBe(true);
  expect(releases).toBe(1);
});

it('client cancellation and underlying failure both release the stream lease', async () => {
  let releases = 0;
  let reason: unknown;
  const options = {
    signal: new AbortController().signal,
    finish: () => {
      releases += 1;
    },
  };
  const source = new ReadableStream<Uint8Array>({
    cancel(value) {
      reason = value;
    },
  });
  await leaseStream(source, options).cancel('client closed');
  expect(reason).toBe('client closed');
  const failed = new ReadableStream<Uint8Array>({
    pull() {
      throw new Error('Storage failed');
    },
  });
  await expect(leaseStream(failed, options).getReader().read()).rejects.toThrow('Storage failed');
  expect(releases).toBe(2);
});

it('keeps request capacity while an aborted upstream cancellation is still settling', async () => {
  let releaseCancellation: (() => void) | undefined;
  const cancellation = new Promise<void>((resolve) => {
    releaseCancellation = resolve;
  });
  let releases = 0;
  let reportReleased: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    reportReleased = resolve;
  });
  const source = new ReadableStream<Uint8Array>({ cancel: () => cancellation });
  const controller = new AbortController();
  const reader = leaseStream(source, {
    signal: controller.signal,
    finish: () => {
      releases += 1;
      reportReleased?.();
    },
  }).getReader();
  const pending = reader.read();
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  controller.abort(new Error('Client disconnected'));
  await expect(pending).rejects.toThrow('Client disconnected');
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
  try {
    expect(releases).toBe(0);
  } finally {
    releaseCancellation?.();
  }
  await cancellation;
  await released;
  expect(releases).toBe(1);
});
