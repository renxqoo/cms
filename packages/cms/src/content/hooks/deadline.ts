export async function withContentDeadline<T>(input: {
  timeoutMs: number;
  signal?: AbortSignal;
  work(signal: AbortSignal): Promise<T>;
}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
  const signal = input.signal
    ? AbortSignal.any([input.signal, controller.signal])
    : controller.signal;
  try {
    return await input.work(signal);
  } finally {
    clearTimeout(timeout);
  }
}
