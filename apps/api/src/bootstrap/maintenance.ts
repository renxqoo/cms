import type { ApplicationRuntime } from './create-runtime.ts';

export function startMaintenance(runtime: ApplicationRuntime, intervalMs: number) {
  let running: Promise<void> | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = runtime
      .maintenance()
      .catch(() => {
        process.stderr.write('CMS maintenance failed.\n');
      })
      .finally(() => {
        running = undefined;
      });
  }, intervalMs);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
