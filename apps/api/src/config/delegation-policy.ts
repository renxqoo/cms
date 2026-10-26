import type { DelegationPolicy } from '@new-cms/cms/platform/contracts';

export function delegationPolicy(): DelegationPolicy {
  return {
    requestTtlMs: 300_000,
    codeTtlMs: 60_000,
    accessTtlMs: 600_000,
    oauthTtlMs: 2_592_000_000,
    maxKeyTtlMs: 7_776_000_000,
    maxActiveGrants: 100,
    maxRetainedGrants: 1000,
    maxGrantOperations: 1000,
    maxDepth: 4,
    maxClients: 10_000,
    clientTtlMs: 604_800_000,
    maxRequests: 20_000,
    maxRefreshTokens: 16_384,
    maxAccessTokens: 1024,
    cleanupBatchSize: 1000,
    grantCleanupBatchSize: 25,
    lastUsedIntervalMs: 60_000,
    cleanupIntervalMs: 10_000,
  };
}
