export const requestPolicy = {
  jsonRequestBytes: 1024 * 1024,
  jsonResponseBytes: 2 * 1024 * 1024,
  byteLimit: 32 * 1024 * 1024,
  streamHighWaterMark: 64 * 1024,
  requestTimeoutMs: 15_000,
  streamTimeoutMs: 90_000,
} as const;
