import { afterEach, expect, it, vi } from 'vitest';
import { startMaintenance } from '../maintenance.ts';
import { loadConfig } from '../load-config.ts';

afterEach(() => vi.useRealTimers());

it('regression: does not leave a newly queued upload waiting for a minute before processing', async () => {
  vi.useFakeTimers();
  const config = loadConfig({
    DATABASE_URL: 'postgresql:///postgres?host=/tmp',
    CMS_RATE_LIMIT_SECRET: 'independent-maintenance-test-secret-2026',
  });
  let queued = false;
  const process = vi.fn<() => Promise<void>>(() => {
    queued = false;
    return Promise.resolve();
  });
  const maintenance = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const stop = startMaintenance({
    assets: { process },
    maintenance,
    maintenanceIntervalMs: config.policy.cleanupIntervalMs,
    assetProcessingIntervalMs: config.assetProcessingIntervalMs,
  });
  try {
    await vi.advanceTimersByTimeAsync(0);
    queued = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(queued).toBe(false);
    expect(process).toHaveBeenCalledOnce();
    expect(maintenance).not.toHaveBeenCalled();
  } finally {
    await stop();
  }
  await vi.advanceTimersByTimeAsync(5000);
  expect(process).toHaveBeenCalledOnce();
});

it('keeps processing bounded to one pass and waits for it when both schedulers stop', async () => {
  vi.useFakeTimers();
  const pending = Promise.withResolvers<void>();
  const process = vi.fn<() => Promise<void>>(() => pending.promise);
  const maintenance = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const stop = startMaintenance({
    assets: { process },
    maintenance,
    maintenanceIntervalMs: 60_000,
    assetProcessingIntervalMs: 1000,
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(process).toHaveBeenCalledOnce();
  expect(maintenance).toHaveBeenCalledOnce();
  let stopped = false;
  const closing = stop().then(() => {
    stopped = true;
    return stopped;
  });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(stopped).toBe(false);
  expect(process).toHaveBeenCalledOnce();
  expect(maintenance).toHaveBeenCalledOnce();
  pending.resolve();
  await closing;
  expect(stopped).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(process).toHaveBeenCalledOnce();
});
