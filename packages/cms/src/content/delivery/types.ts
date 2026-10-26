import type { PublicObject } from './contracts.ts';
import type { SqlExecutor } from '@new-cms/database/client';
import type { ContentRuntime } from '../types.ts';
import type { ExamplePolicy } from './profiles/index.ts';

export interface DeliveryPolicy {
  maxResponseBytes: number;
  maxSqlQueries: number;
  readTimeoutMs: number;
  maxNavigationItems: number;
  maxRelatedItems: number;
  exportBatchSize: number;
  exportMaxSqlQueries: number;
  exportMaxItems: number;
  exportMaxBytes: number;
  exportMaxFrameBytes: number;
  exportTimeoutMs: number;
  exportWriteTimeoutMs: number;
  previewTtlMs: number;
  previewMaxActivePerIssuer: number;
  previewMaxActive: number;
}
export interface MessageContract {
  version: string;
  validate(messages: PublicObject): boolean;
  availableUntil: string | null;
}
export interface ContentDeliveryOptions {
  clientOrigin: string;
  policy: DeliveryPolicy;
  messageContracts: readonly MessageContract[];
  examplePolicy: ExamplePolicy;
}
export interface DeliverySession {
  runtime: ContentRuntime;
  tx: SqlExecutor;
  locale: string;
  enabledLocales: readonly string[];
  options: ContentDeliveryOptions;
  preview?: { documentId: string; versionId: string };
}
