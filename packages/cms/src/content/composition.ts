import { createLocaleMapping } from './locale-source.ts';
import { createContentDelivery } from './delivery/api.ts';
import { createLanguageManagementApi } from './delivery/language-management.ts';
import type { ContentDeliveryOptions } from './delivery/types.ts';
import { assetsOperations } from '@new-cms/cms/assets';
import { contentOperations } from './operations.ts';
import { fail } from '@new-cms/cms/platform/contracts';
import { createContentStore } from './adapters/postgres/store.ts';
import { compileContent } from './adapters/postgres/compile-schema.ts';
import { contentInputSchemas } from './input-schemas.ts';
import { createCollectionApi } from './collections-api.ts';
import { createEditorApi } from './editor/api.ts';
import { relationScopes } from './documents/relation-scopes.ts';
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
import { createDiscoveryApi } from './jobs/listing.ts';
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
  if (
    options.registry.list.some((collection) => collection.localeSource) &&
    !options.resolveLocaleSource
  )
    throw new Error('Content locale source resolver is missing');
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
    options.uploadPolicy.variantQuality > 100 ||
    [
      options.uploadPolicy.imageLimits.maxOutputBytes,
      options.uploadPolicy.imageLimits.maxPixels,
      options.uploadPolicy.imageLimits.maxFrames,
      options.uploadPolicy.imageLimits.maxWidth,
      options.uploadPolicy.imageLimits.maxHeight,
      options.uploadPolicy.imageLimits.maxVariants,
    ].some((value) => !Number.isSafeInteger(value) || value < 1)
  )
    throw new Error('Invalid upload policy');
}

function createApi(runtime: ContentRuntime) {
  return {
    ...createCollectionApi(runtime),
    ...createEditorApi(runtime),
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
    ...createDiscoveryApi(runtime),
    ...createResourceApi(runtime),
    ...createLanguageManagementApi(runtime),
  };
}

export function createContent(options: ContentOptions) {
  validateOptions(options);
  const mappingFor = createLocaleMapping(options);
  const runtime: ContentRuntime = {
    ...options,
    store: createContentStore({ mapping: options.mapping, limits: options.limits, mappingFor }),
    resolveCollection: async (tx, key) => (await mappingFor(tx)).get(key).definition,
    resolveRelationScopes: (state) => relationScopes(state, runtime),
    schemas: contentInputSchemas({
      ...options.limits,
      maxBatchItems: options.workPolicy.maxBatchItems,
    }),
  };
  const maintenance = createContentMaintenance(runtime);
  return {
    api: createApi(runtime),
    createDelivery: (deliveryOptions: ContentDeliveryOptions) =>
      createContentDelivery(runtime, deliveryOptions),
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
        const preview = await tx.query(
          "SELECT 1 FROM cms_migrations WHERE name='0016_content_preview_grants.sql'",
        );
        if (preview.rowCount !== 1) fail('temporarily_unavailable');
      }, signal);
    },
    ...maintenance,
  };
}

export type ContentApi = ReturnType<typeof createContent>['api'];
export type { ContentDeliveryApi } from './delivery/api.ts';
export {
  createContentLocaleResolver,
  createContentLocaleValidator,
} from './delivery/locale-resolver.ts';
export type { ContentLocaleSource } from './definition.ts';

export type {
  ContentOptions,
  ContentWorkPolicy,
  ContentUploadsApi,
  ContentDocumentView,
  ContentMediaAuthorizer,
} from './types.ts';

export { createContentSchemaMigrator } from './schema-migrator.ts';
export { createPublicationMigrator } from './publication-migrator.ts';
export type { ContentSchemaMigratorOptions } from './schema-migrator.ts';
