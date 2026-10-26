export const discoveryPolicy = {
  listIntervalMs: 10_000,
  detailIntervalMs: 5_000,
  maximumWaitMs: 5 * 60_000,
  defaultPageSize: 20,
  maximumPageSize: 100,
} as const;

export function activeJob(status: string) {
  return status === 'queued' || status === 'running';
}

export function activeUpload(status: string) {
  return status === 'pending' || status === 'uploading' || status === 'processing';
}
