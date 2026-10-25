import {
  cleanupEntrySchema,
  cleanupPageSchema,
  cleanupRetryReceiptSchema,
} from '@new-cms/cms/assets';
import { outputSchema } from './output-schema.ts';
import type { Schema } from './schema.ts';

export function managementResponseSchemas(): Record<string, Schema> {
  return {
    AssetCleanup: outputSchema('AssetCleanup', cleanupEntrySchema),
    AssetCleanupPage: outputSchema('AssetCleanupPage', cleanupPageSchema),
    AssetCleanupRetry: outputSchema('AssetCleanupRetry', cleanupRetryReceiptSchema),
  };
}
