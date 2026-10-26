import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabase } from '@new-cms/database/client';
import { createTestPolicy } from '../../../../../test/support/policy.ts';
import { createAssets } from '../composition.ts';
import type { processJobs } from '../jobs/maintenance.ts';
import type { cleanupAssets, reconcileCleanup } from '../jobs/cleanup.ts';
import { limits, memoryStorage } from './support.ts';

const mocks = vi.hoisted(() => ({
  process: vi.fn<typeof processJobs>(),
  cleanup: vi.fn<typeof cleanupAssets>(),
  reconcile: vi.fn<typeof reconcileCleanup>(),
}));
vi.mock('../jobs/maintenance.ts', () => ({ processJobs: mocks.process }));
vi.mock('../jobs/cleanup.ts', () => ({
  cleanupAssets: mocks.cleanup,
  reconcileCleanup: mocks.reconcile,
}));

const resources: (() => Promise<void>)[] = [];
beforeEach(() => mocks.cleanup.mockResolvedValue(0));
afterEach(async () => {
  for (const close of resources.splice(0)) await close();
  vi.resetAllMocks();
});

function unexpected(): never {
  throw new Error('This lifecycle operation must not perform business writes');
}

function kit() {
  const database = createDatabase({ connectionString: 'postgresql:///postgres?host=/tmp' });
  const closeImages = vi.fn<() => Promise<void>>(() => Promise.resolve());
  const assets = createAssets({
    database,
    policy: createTestPolicy(),
    limits,
    resourceLockKey: 417,
    storage: memoryStorage().driver,
    images: { version: 'test', process: unexpected, close: closeImages },
    authorize: unexpected,
    authorizeActor: unexpected,
    authorizeContent: unexpected,
    commitProcessing: unexpected,
  });
  resources.push(async () => {
    await assets.close();
    await database.close();
  });
  return { assets, closeImages };
}

it('shares one processing pass between the fast worker and periodic cleanup', async () => {
  const pending = Promise.withResolvers<number>();
  mocks.process.mockReturnValue(pending.promise);
  const { assets } = kit();
  const processing = assets.process();
  const maintenance = assets.maintenance();
  expect(mocks.process).toHaveBeenCalledOnce();
  pending.resolve(2);
  expect(await processing).toBe(2);
  expect(await maintenance).toEqual({ processed: 2, cleaned: 0 });
  mocks.process.mockResolvedValue(1);
  expect(await assets.process()).toBe(1);
});

it('aborts a fast processing pass and waits for its exit before closing image resources', async () => {
  const pending = Promise.withResolvers<number>();
  mocks.process.mockReturnValue(pending.promise);
  const { assets, closeImages } = kit();
  const processing = assets.process();
  const signal = mocks.process.mock.calls[0]?.[1];
  const closing = assets.close();
  expect(signal?.aborted).toBe(true);
  expect(closeImages).not.toHaveBeenCalled();
  pending.resolve(0);
  await processing;
  await closing;
  expect(closeImages).toHaveBeenCalledOnce();
});
