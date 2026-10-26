import { mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReadableStream as FileReadableStream } from 'node:stream/web';
import { expect, it, vi } from 'vitest';
import { createLocalStream } from '../local-stream.ts';

it('regression: a failed underlying read closes the descriptor and releases ownership even when cancelling the failed stream rejects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cms-storage-failed-stream-'));
  const file = await open(join(root, 'private-file'), 'w+', 0o600);
  const released = vi.fn<() => void>();
  try {
    const source = new FileReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Injected storage read failure'));
      },
    });
    vi.spyOn(file, 'readableWebStream').mockReturnValue(source);
    const { stream } = createLocalStream(file, {
      signal: new AbortController().signal,
      done: released,
    });
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow(
      'Injected storage read failure',
    );
    await expect(file.stat()).rejects.toThrow(/closed|EBADF|bad file descriptor/i);
    expect(released).toHaveBeenCalledOnce();
  } finally {
    await file.close();
    await rm(root, { recursive: true, force: true });
  }
});
