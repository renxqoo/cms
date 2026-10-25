import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

const declarations = [
  ['assets.createUpload', 'POST', '/uploads'],
  ['assets.listUploads', 'GET', '/uploads'],
  ['assets.writeUpload', 'PUT', '/uploads/:uploadId/content'],
  ['assets.completeUpload', 'POST', '/uploads/:uploadId/completions'],
  ['assets.readUpload', 'GET', '/uploads/:uploadId'],
  ['assets.cancelUpload', 'DELETE', '/uploads/:uploadId'],
  ['assets.download', 'GET', '/documents/:id/file'],
  ['assets.downloadBinding', 'GET', '/documents/:id/media-bindings/:bindingId/file'],
  ['assets.reprocess', 'POST', '/documents/:id/file-processings'],
] as const;

const collectionOperations: readonly OperationDefinition[] = declarations.map(
  ([id, method, path]) => ({
    id,
    method,
    path: `/v1/collections/:collection${path}`,
    module: 'assets',
    scopeKind: 'collection',
    access: 'permission',
    bindingConfigurable: true,
    ...(['assets.createUpload', 'assets.completeUpload', 'assets.reprocess'].includes(id)
      ? { idempotency: 'required' as const }
      : {}),
    ...(id === 'assets.createUpload' ? { successStatus: 201 as const } : {}),
    ...(['assets.completeUpload', 'assets.reprocess'].includes(id)
      ? { successStatus: 202 as const }
      : {}),
  }),
);

const cleanupDeclarations = [
  ['assets.listCleanup', 'GET', '/v1/asset-cleanups'],
  ['assets.getCleanup', 'GET', '/v1/asset-cleanups/:id'],
  ['assets.retryCleanup', 'POST', '/v1/asset-cleanups/:id/retries'],
] as const;

export const assetsOperations: readonly OperationDefinition[] = [
  ...collectionOperations,
  ...cleanupDeclarations.map(([id, method, path]): OperationDefinition => ({
    id,
    method,
    path,
    module: 'assets',
    access: 'security',
    scopeKind: 'global',
    bindingConfigurable: false,
    ...(id === 'assets.retryCleanup'
      ? { idempotency: 'required' as const, successStatus: 202 as const }
      : {}),
  })),
];
