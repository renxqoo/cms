import { CmsError, fail } from '@new-cms/cms/platform/contracts';

interface Waiting {
  start(): void;
  stop(): void;
}

export function createCapacity(input: { concurrent: number; queue: number; timeoutMs: number }) {
  let active = 0;
  let closed = false;
  const queue: Waiting[] = [];
  const idle: (() => void)[] = [];
  function release(): void {
    active -= 1;
    queue.shift()?.start();
    if (active === 0) for (const resolve of idle.splice(0)) resolve();
  }
  function enter(signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    if (closed) fail('temporarily_unavailable');
    if (active < input.concurrent) {
      active += 1;
      return Promise.resolve();
    }
    if (queue.length >= input.queue) fail('capacity_exceeded');
    return waitForSlot({
      queue,
      signal,
      timeoutMs: input.timeoutMs,
      onEnter: () => {
        active += 1;
      },
    });
  }
  return {
    async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      await enter(signal);
      try {
        return await work();
      } finally {
        release();
      }
    },
    close() {
      closed = true;
      for (const waiting of queue.splice(0)) waiting.stop();
      return active === 0
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            idle.push(resolve);
          });
    },
  };
}

function waitForSlot(input: {
  queue: Waiting[];
  signal: AbortSignal;
  timeoutMs: number;
  onEnter(): void;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: Error) => {
      clearTimeout(timer);
      input.signal.removeEventListener('abort', abort);
      const index = input.queue.indexOf(waiting);
      if (index >= 0) input.queue.splice(index, 1);
      if (error) reject(error);
      else {
        input.onEnter();
        resolve();
      }
    };
    const abort = () => finish(new CmsError('temporarily_unavailable'));
    const timer = setTimeout(
      () => finish(new CmsError('temporarily_unavailable')),
      input.timeoutMs,
    );
    const waiting = {
      start: () => finish(),
      stop: () => finish(new CmsError('temporarily_unavailable')),
    };
    input.queue.push(waiting);
    input.signal.addEventListener('abort', abort, { once: true });
  });
}
