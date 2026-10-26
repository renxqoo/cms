function startLoop(work: () => Promise<unknown>, intervalMs: number) {
  let running: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (running) return;
    running = work()
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

export function startMaintenance(runtime: {
  maintenance: () => Promise<unknown>;
  assets: { process: () => Promise<unknown> };
  maintenanceIntervalMs: number;
  assetProcessingIntervalMs: number;
}) {
  const stopCleanup = startLoop(() => runtime.maintenance(), runtime.maintenanceIntervalMs);
  const stopProcessing = startLoop(
    () => runtime.assets.process(),
    runtime.assetProcessingIntervalMs,
  );
  return async () => {
    await Promise.all([stopCleanup(), stopProcessing()]);
  };
}
