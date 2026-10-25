import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

const declarations = [
  ['assets.createUpload', 'POST', '/uploads'],
  ['assets.writeUpload', 'PUT', '/uploads/:uploadId/content'],
  ['assets.completeUpload', 'POST', '/uploads/:uploadId/completions'],
  ['assets.readUpload', 'GET', '/uploads/:uploadId'],
  ['assets.cancelUpload', 'DELETE', '/uploads/:uploadId'],
  ['assets.download', 'GET', '/documents/:id/file'],
  ['assets.downloadBinding', 'GET', '/documents/:id/media-bindings/:bindingId/file'],
  ['assets.reprocess', 'POST', '/documents/:id/file-processings'],
] as const;

export const assetsOperations: readonly OperationDefinition[] = declarations.map(
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
