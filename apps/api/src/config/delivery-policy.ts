import { interfaceMessageContract } from './message-contract.ts';
import type {
  DeliveryPolicy,
  ExamplePolicy,
  ContentDeliveryOptions,
} from '@new-cms/cms/content/delivery';

export function contentDeliveryPolicy(): DeliveryPolicy {
  return {
    maxResponseBytes: 2_097_152,
    maxSqlQueries: 200,
    readTimeoutMs: 4000,
    maxNavigationItems: 100,
    maxRelatedItems: 6,
    exportBatchSize: 100,
    exportMaxSqlQueries: 10_000,
    exportMaxItems: 100_000,
    exportMaxBytes: 33_554_432,
    exportMaxFrameBytes: 262_144,
    exportTimeoutMs: 15_000,
    exportWriteTimeoutMs: 2000,
    previewTtlMs: 600_000,
    previewMaxActivePerIssuer: 20,
    previewMaxActive: 10_000,
  };
}
export function contentExamplePolicy(): ExamplePolicy {
  return {
    requestTimeoutMs: 60_000,
    pollIntervalMs: 2000,
    pollDeadlineMs: 600_000,
    maxResponseBytes: 8_388_608,
  };
}

export function contentDeliveryConfiguration(clientOrigin: string): ContentDeliveryOptions {
  return {
    clientOrigin,
    policy: contentDeliveryPolicy(),
    examplePolicy: contentExamplePolicy(),
    messageContracts: [interfaceMessageContract],
  };
}
