import type { AssetsOptions } from './types.ts';
import type { createCapacity } from './uploads/capacity.ts';
import { processJobs } from './jobs/maintenance.ts';
import { cleanupAssets, reconcileCleanup } from './jobs/cleanup.ts';

export function createAssetLifecycle(input: {
  runtime: AssetsOptions;
  capacity: ReturnType<typeof createCapacity>;
  controller: AbortController;
}) {
  const { runtime, capacity, controller } = input;
  let running: Promise<{ processed: number; cleaned: number }> | undefined;
  let reconciling: Promise<{ retried: number; cleaned: number }> | undefined;
  let closing: Promise<void> | undefined;
  async function closeResources(): Promise<void> {
    controller.abort();
    await capacity.close();
    await running?.catch(() => {});
    await reconciling?.catch(() => {});
    await runtime.images.close();
    await runtime.storage.close();
  }
  return {
    maintenance() {
      running ??= (async () => ({
        processed: await processJobs(runtime, controller.signal),
        cleaned: await cleanupAssets(runtime, controller.signal),
      }))().finally(() => {
        running = undefined;
      });
      return running;
    },
    stop: () => controller.abort(),
    reconcileCleanup() {
      reconciling ??= reconcileCleanup(runtime, controller.signal).finally(() => {
        reconciling = undefined;
      });
      return reconciling;
    },
    async verifyReady(signal?: AbortSignal) {
      signal?.throwIfAborted();
      await runtime.storage.verify(signal);
      await runtime.database.query(
        'SELECT u.generation,u.bound_document_id,j.lease_until,o.object_key,m.processor_version FROM asset_uploads u,asset_jobs j,asset_objects o,asset_manifests m LIMIT 0',
      );
      signal?.throwIfAborted();
    },
    close() {
      closing ??= closeResources();
      return closing;
    },
  };
}
