import { createCleanupApi } from './management/api.ts';
import { createCapacity } from './uploads/capacity.ts';
import { createSessionApi } from './uploads/sessions.ts';
import { createUploadWriter } from './uploads/write-upload.ts';
import { createParticipants } from './references/participants.ts';
import { createDownloader } from './manifests/download.ts';
import { createReprocessor } from './processing/reprocess.ts';
import { createJobReader } from './jobs/read-job.ts';
import { createAssetLifecycle } from './lifecycle.ts';
import { validateLimits } from './validation.ts';
import type { AssetsOptions } from './types.ts';

export function createAssets(options: AssetsOptions) {
  validateLimits(options.limits);
  if (!Number.isSafeInteger(options.resourceLockKey))
    throw new Error('Invalid asset resource lock key');
  const controller = new AbortController();
  const capacity = createCapacity({
    concurrent: options.limits.uploadConcurrency,
    queue: options.limits.uploadQueueSize,
    timeoutMs: options.limits.uploadQueueTimeoutMs,
  });
  const runtime = { ...options, signal: controller.signal };

  return {
    api: {
      ...createCleanupApi(runtime),
      ...createSessionApi(runtime),
      writeUpload: createUploadWriter(runtime, capacity),
      download: createDownloader(runtime),
      reprocess: createReprocessor(runtime),
      readJob: createJobReader(runtime),
    },
    participants: createParticipants(options.limits.retentionMs),
    ...createAssetLifecycle({ runtime, capacity, controller }),
  };
}

export type AssetsApi = ReturnType<typeof createAssets>['api'];
export type {
  AssetsOptions,
  AssetsParticipants,
  AuthorizedManifest,
  AssetLimits,
  StorageDriver,
  ImageProcessor,
  ProcessedImage,
  ContentAuthorizer,
  ContentAuthorization,
  ContentAuthorizationInput,
  ImageRecipe,
  VariantRecipe,
  UploadSettings,
  ManifestSummary,
  AssetJobView,
} from './types.ts';

export { assetDiscoverySources } from './discovery/sources.ts';
export type { AssetDiscoverySources, DiscoveryRelation } from './discovery/sources.ts';

export {
  cleanupEntrySchema,
  cleanupPageSchema,
  cleanupRetryReceiptSchema,
} from './management/contracts.ts';
export type { CleanupEntry, CleanupPage, CleanupRetryReceipt } from './management/contracts.ts';
