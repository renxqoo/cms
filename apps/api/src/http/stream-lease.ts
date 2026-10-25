interface StreamLease {
  signal: AbortSignal;
  finish(): void;
}

export function leaseStream(
  source: ReadableStream<Uint8Array>,
  lease: StreamLease,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let finished = false;
  let cancelling = false;
  let onAbort: (() => void) | undefined;
  function finish() {
    if (finished) return;
    finished = true;
    if (onAbort) lease.signal.removeEventListener('abort', onAbort);
    lease.finish();
  }
  return new ReadableStream<Uint8Array>({
    start(controller) {
      onAbort = () => {
        if (finished || cancelling) return;
        cancelling = true;
        controller.error(lease.signal.reason);
        void reader.cancel(lease.signal.reason).then(finish, finish);
      };
      if (lease.signal.aborted) onAbort();
      else lease.signal.addEventListener('abort', onAbort, { once: true });
    },
    async pull(controller) {
      try {
        const result = await reader.read();
        if (finished || cancelling) return;
        if (result.done) {
          controller.close();
          finish();
        } else controller.enqueue(result.value);
      } catch (error) {
        if (!finished && !cancelling) {
          controller.error(error);
          finish();
        }
      }
    },
    async cancel(reason) {
      cancelling = true;
      try {
        await reader.cancel(reason);
      } finally {
        finish();
      }
    },
  });
}
