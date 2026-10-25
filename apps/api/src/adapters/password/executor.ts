import { CmsError, fail } from '@new-cms/cms/platform/contracts';
import type { CmsPolicy } from '@new-cms/cms/platform/contracts';

interface Waiting {
  start: () => void;
  cancel: () => void;
}

function bounded<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cancel = () => reject(new CmsError('temporarily_unavailable'));
    const timer = setTimeout(cancel, timeoutMs);
    signal?.addEventListener('abort', cancel, { once: true });
    const clean = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    };
    promise.then(
      (value) => {
        clean();
        return resolve(value);
      },
      (error: unknown) => {
        clean();
        return reject(error);
      },
    );
    if (signal?.aborted) cancel();
  });
}

function enqueue(options: {
  queue: Waiting[];
  policy: CmsPolicy;
  signal: AbortSignal | undefined;
  grant: () => void;
}): Promise<void> {
  const { queue, policy, signal, grant } = options;
  return new Promise((resolve, reject) => {
    const clean = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', waiting.cancel);
    };
    const waiting: Waiting = {
      start: () => {
        clean();
        grant();
        resolve();
      },
      cancel: () => {
        clean();
        const index = queue.indexOf(waiting);
        if (index >= 0) queue.splice(index, 1);
        reject(new CmsError('temporarily_unavailable'));
      },
    };
    const timer = setTimeout(waiting.cancel, policy.passwordQueueTimeoutMs);
    signal?.addEventListener('abort', waiting.cancel, { once: true });
    queue.push(waiting);
    if (signal?.aborted) waiting.cancel();
  });
}

export function createPasswordExecutor(policy: CmsPolicy) {
  const queue: Waiting[] = [];
  const active = new Set<Promise<unknown>>();
  let permits = 0;
  let closed = false;
  function release(): void {
    permits -= 1;
    if (!closed) queue.shift()?.start();
  }
  function acquire(signal?: AbortSignal): Promise<void> {
    if (closed || signal?.aborted) fail('temporarily_unavailable');
    if (permits < policy.passwordConcurrency) {
      permits += 1;
      return Promise.resolve();
    }
    if (queue.length >= policy.passwordQueueLimit) fail('temporarily_unavailable');
    return enqueue({
      queue,
      policy,
      signal,
      grant: () => {
        permits += 1;
      },
    });
  }
  async function run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await acquire(signal);
    const job = Promise.resolve().then(work).finally(release);
    active.add(job);
    void job.then(
      () => active.delete(job),
      () => active.delete(job),
    );
    return bounded(job, signal, policy.passwordTimeoutMs);
  }
  async function close(): Promise<void> {
    closed = true;
    while (queue.length > 0) queue[0]?.cancel();
    await Promise.allSettled(active);
  }
  return { run, close };
}
