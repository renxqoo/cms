export const assetWorkPolicy = {
  uploadConcurrency: 2,
  uploadQueueLimit: 20,
  uploadPollMs: 10_000,
  listPollMs: 10_000,
  detailPollMs: 5_000,
  automaticWaitMs: 5 * 60_000,
  pageSize: 20,
} as const;
