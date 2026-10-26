export const assetUiPolicy = {
  concurrency: 2,
  queueSize: 20,
  pollIntervalMs: 1000,
  sustainedPollIntervalMs: 3000,
  fastPollWindowMs: 10_000,
  maximumWaitMs: 300_000,
  pageSize: 20,
} as const;
