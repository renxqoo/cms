import { assetsOperations } from '@new-cms/cms/assets';
import { contentOperations } from './operations.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { createContentStore } from './adapters/postgres/store.ts';
import { compileContent } from './adapters/postgres/compile-schema.ts';
import { contentInputSchemas } from './input-schemas.ts';
import { createCollectionApi } from './collections-api.ts';
import { createReadDocumentApi } from './documents/read-document.ts';
import { createCreateDocumentApi } from './documents/create-document.ts';
import { createSaveDocumentApi } from './documents/save-document.ts';
import { createPublicationApi } from './documents/publish-document.ts';
import { createCopyDocumentApi } from './documents/copy-document.ts';
import { createArchiveApi } from './documents/archive-document.ts';
import { createRestoreTrashApi } from './documents/restore-trash.ts';
import { createPurgeApi } from './documents/purge-document.ts';
import { createVersionReadApi } from './versions/api.ts';
import { createVersionRestoreApi } from './versions/restore-version.ts';
import { createFolderApi } from './folders/api.ts';
import { createJobApi } from './jobs/api.ts';
import { createResourceApi } from './resources.ts';
import {
  createMediaAuthorizer,
  createProcessingCommitter,
} from './documents/media-authorization.ts';
import { createContentMaintenance } from './jobs/worker.ts';
import type { ContentOptions, ContentRuntime } from './types.ts';

function validateOptions(options: ContentOptions): void {
  for (const [key, value] of Object.entries(options.workPolicy)) {
    const minimum = key === 'trashRetentionMs' ? 0 : 1;
    if (!Number.isSafeInteger(value) || value < minimum)
      throw new Error('Invalid content work policy');
  }
  if (
    options.workPolicy.maxSyncBatchItems > options.workPolicy.maxBatchItems ||
    options.workPolicy.jobLeaseMs <= options.policy.statementTimeoutMs
  )
    throw new Error('Invalid content work budgets');
  validateUploadPolicy(options);
  if (
    options.registry.list.some((collection) => collection.upload) &&
    (!options.assets || !options.uploadApi)
  )
    throw new Error('Upload collections require assets');
  validateAccessOperations(options);
  validateExtensionHandlers(options);
  if (compileContent(options.registry).fingerprint !== options.mapping.fingerprint)
    throw new Error('Content mapping differs from the registry');
}

function validateExtensionHandlers(options: ContentOptions): void {
  for (const collection of options.registry.list) {
    for (const extension of collection.extensions ?? []) {
      if (
        extension.afterCommit &&
        (!Object.hasOwn(options.afterCommitHandlers, extension.afterCommit) ||
          typeof options.afterCommitHandlers[extension.afterCommit] !== 'function')
      )
        throw new Error('Content extension handler is missing');
    }
  }
}

function validateAccessOperations(options: ContentOptions): void {
  const known = new Set(
    [...contentOperations, ...assetsOperations]
      .filter((operation) => operation.scopeKind === 'collection')
      .map((operation) => operation.id),
  );
  for (const collection of options.registry.list) {
    if (Object.keys(collection.access ?? {}).some((key) => !known.has(key)))
      throw new Error('Unknown content access operation');
  }
}

function validateUploadPolicy(options: ContentOptions): void {
  if (
    !Number.isSafeInteger(options.uploadPolicy.maxBytes) ||
    options.uploadPolicy.maxBytes < 1 ||
    !Number.isInteger(options.uploadPolicy.variantQuality) ||
    options.uploadPolicy.variantQuality < 1 ||
    options.uploadPolicy.variantQuality > 100
  )
    throw new Error('Invalid upload policy');
}

function createApi(runtime: ContentRuntime) {
  return {
    ...createCollectionApi(runtime),
    ...createReadDocumentApi(runtime),
    ...createCreateDocumentApi(runtime),
    ...createSaveDocumentApi(runtime),
    ...createPublicationApi(runtime),
    ...createCopyDocumentApi(runtime),
    ...createArchiveApi(runtime),
    ...createRestoreTrashApi(runtime),
    ...createPurgeApi(runtime),
    ...createVersionReadApi(runtime),
    ...createVersionRestoreApi(runtime),
    ...createFolderApi(runtime),
    ...createJobApi(runtime),
    ...createResourceApi(runtime),
  };
}

export function createContent(options: ContentOptions) {
  validateOptions(options);
  const runtime: ContentRuntime = {
    ...options,
    store: createContentStore({ mapping: options.mapping, limits: options.limits }),
    schemas: contentInputSchemas({
      ...options.limits,
      maxBatchItems: options.workPolicy.maxBatchItems,
    }),
  };
  const maintenance = createContentMaintenance(runtime);
  return {
    api: createApi(runtime),
    uploads: options.uploadApi,
    authorizeMedia: createMediaAuthorizer(runtime),
    participants: { commitProcessing: createProcessingCommitter(runtime) },
    async verifyReady(signal?: AbortSignal) {
      await options.database.transaction(async (tx) => {
        await runtime.store.verifyReady(tx);
        const work = await tx.query(
          "SELECT 1 FROM cms_migrations WHERE name='0004_content_work.sql'",
        );
        if (work.rowCount !== 1) fail('temporarily_unavailable');
      }, signal);
    },
    ...maintenance,
  };
}

export type ContentApi = ReturnType<typeof createContent>['api'];
export type {
  ContentOptions,
  ContentWorkPolicy,
  ContentUploadsApi,
  ContentDocumentView,
  ContentMediaAuthorizer,
} from './types.ts';

export { createContentSchemaMigrator } from './schema-migrator.ts';
export type { ContentSchemaMigratorOptions } from './schema-migrator.ts';
