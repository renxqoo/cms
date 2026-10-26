import { fail } from '@new-cms/cms/platform/contracts';
import type { AssetsOptions } from './types.ts';
import type { createCapacity } from './uploads/capacity.ts';
import { processJobs } from './jobs/maintenance.ts';
import { cleanupAssets, reconcileCleanup } from './jobs/cleanup.ts';

async function verifyReady(runtime: AssetsOptions, signal?: AbortSignal) {
  signal?.throwIfAborted();
  await runtime.storage.verify(signal);
  await runtime.database.query(
    'SELECT u.generation,u.bound_document_id,j.lease_until,o.object_key,o.cleanup_generation,m.processor_version FROM asset_uploads u,asset_jobs j,asset_objects o,asset_manifests m LIMIT 0',
  );
  const migration = await runtime.database.query(
    "SELECT 1 FROM cms_migrations WHERE name='0011_ui_api.sql'",
  );
  if (migration.rowCount !== 1) fail('temporarily_unavailable');
  signal?.throwIfAborted();
}

export function createAssetLifecycle(input: {
  runtime: AssetsOptions;
  capacity: ReturnType<typeof createCapacity>;
  controller: AbortController;
}) {
  const { runtime, capacity, controller } = input;
  let running: Promise<{ processed: number; cleaned: number }> | undefined;
  let processing: Promise<number> | undefined;
  let reconciling: Promise<{ retried: number; cleaned: number }> | undefined;
  let closing: Promise<void> | undefined;
  function process() {
    processing ??= processJobs(runtime, controller.signal).finally(() => {
      processing = undefined;
    });
    return processing;
  }
  async function closeResources(): Promise<void> {
    controller.abort();
    await capacity.close();
    await running?.catch(() => {});
    await processing?.catch(() => {});
    await reconciling?.catch(() => {});
    await runtime.images.close();
    await runtime.storage.close();
  }
  return {
    process,
    maintenance() {
      running ??= (async () => ({
        processed: await process(),
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
    verifyReady: (signal?: AbortSignal) => verifyReady(runtime, signal),
    close() {
      closing ??= closeResources();
      return closing;
    },
  };
}
