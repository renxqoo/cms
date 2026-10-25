import type { ContentLimits } from '@new-cms/cms/content/generate';
import type { ContentWorkPolicy, ContentOptions } from '@new-cms/cms/content/composition';
import type { AssetLimits } from '@new-cms/cms/assets/composition';

export function contentLimits(): ContentLimits {
  return {
    maxLocales: 20,
    maxStorageBytes: 16_777_216,
    maxFields: 500,
    maxFieldDepth: 8,
    maxArrayItems: 1000,
    maxDataBytes: 1_048_576,
    maxRichTextNodes: 10_000,
    maxRichTextDepth: 16,
    maxQueryNodes: 100,
    maxQueryDepth: 8,
    maxPageSize: 100,
    defaultPageSize: 20,
    maxExpandDepth: 3,
    maxExpandNodes: 500,
    maxResponseBytes: 2_097_152,
    maxSqlQueries: 200,
  };
}

export function contentWorkPolicy(): ContentWorkPolicy {
  return {
    resourceLockKey: 1_171_904_223,
    maxBatchItems: 1000,
    maxSyncBatchItems: 20,
    jobBatchSize: 20,
    jobLeaseMs: 30_000,
    jobMaxAttempts: 3,
    maxScheduleDelayMs: 31_536_000_000,
    trashRetentionMs: 604_800_000,
    maxFolders: 10_000,
    maxFolderDepth: 16,
  };
}

export function contentMigrationPolicy() {
  const limits = contentLimits();
  return {
    defaultPageSize: limits.defaultPageSize,
    maxPageSize: limits.maxPageSize,
    maxPages: 1000,
  };
}

export function assetLimits(): AssetLimits {
  return {
    maxActiveSessionsPerActor: 100,
    maxActiveBytesPerActor: 1_073_741_824,
    maxActiveSessions: 10_000,
    maxActiveBytes: 21_474_836_480,
    maxUploadBytes: 20_971_520,
    maxOutputBytes: 20_971_520,
    maxPixels: 40_000_000,
    maxFrames: 1,
    maxWidth: 16_384,
    maxHeight: 16_384,
    uploadConcurrency: 4,
    uploadQueueSize: 8,
    uploadQueueTimeoutMs: 5000,
    uploadTimeoutMs: 60_000,
    processingTimeoutMs: 15_000,
    sessionTtlMs: 1_800_000,
    retentionMs: 604_800_000,
    leaseMs: 30_000,
    jobAttempts: 3,
    maintenanceBatchSize: 20,
    maxVariants: 10,
  };
}

export function contentUploadPolicy(limits: AssetLimits): ContentOptions['uploadPolicy'] {
  return {
    maxBytes: limits.maxUploadBytes,
    variantQuality: 85,
    variantFormat: 'webp',
    imageLimits: {
      maxOutputBytes: limits.maxOutputBytes,
      maxPixels: limits.maxPixels,
      maxFrames: limits.maxFrames,
      maxWidth: limits.maxWidth,
      maxHeight: limits.maxHeight,
      maxVariants: limits.maxVariants,
    },
  };
}
