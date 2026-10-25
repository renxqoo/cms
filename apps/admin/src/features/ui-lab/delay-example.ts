export function delayExample<T>(value: T, signal: AbortSignal, delayMs: number): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Example canceled', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', cancel);
      resolve(value);
    }, delayMs);
    function cancel() {
      clearTimeout(timer);
      signal.removeEventListener('abort', cancel);
      reject(new DOMException('Example canceled', 'AbortError'));
    }
    signal.addEventListener('abort', cancel, { once: true });
  });
}
