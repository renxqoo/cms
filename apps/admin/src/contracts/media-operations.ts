import { defineOperation } from './operation-definition';

const page = ['page', 'pageSize'] as const;
export const mediaOperations = [
  defineOperation(
    'documents.renameFile',
    ['POST', '/v1/collections/:collection/documents/:id/file-renames'],
    { idempotency: 'required' },
  ),
  defineOperation('assets.listUploads', ['GET', '/v1/collections/:collection/uploads'], {
    queryKeys: [...page, 'status', 'purpose', 'documentId', 'locale'],
  }),
  defineOperation('assets.createUpload', ['POST', '/v1/collections/:collection/uploads'], {
    idempotency: 'required',
  }),
  defineOperation(
    'assets.writeUpload',
    ['PUT', '/v1/collections/:collection/uploads/:uploadId/content'],
    {
      bodyKind: 'bytes',
    },
  ),
  defineOperation(
    'assets.completeUpload',
    ['POST', '/v1/collections/:collection/uploads/:uploadId/completions'],
    { bodyKind: 'json', idempotency: 'required' },
  ),
  defineOperation('assets.readUpload', ['GET', '/v1/collections/:collection/uploads/:uploadId']),
  defineOperation(
    'assets.cancelUpload',
    ['DELETE', '/v1/collections/:collection/uploads/:uploadId'],
    {
      responseKind: 'empty',
    },
  ),
  defineOperation('assets.download', ['GET', '/v1/collections/:collection/documents/:id/file'], {
    queryKeys: ['versionId', 'variant', 'mode', 'locale', 'fallback'],
    responseKind: 'stream',
  }),
  defineOperation(
    'assets.downloadBinding',
    ['GET', '/v1/collections/:collection/documents/:id/media-bindings/:bindingId/file'],
    { queryKeys: ['versionId', 'variant', 'mode', 'locale', 'fallback'], responseKind: 'stream' },
  ),
  defineOperation(
    'assets.reprocess',
    ['POST', '/v1/collections/:collection/documents/:id/file-processings'],
    { idempotency: 'required' },
  ),
  defineOperation('assets.listCleanup', ['GET', '/v1/asset-cleanups'], {
    queryKeys: [...page, 'blocked', 'state'],
  }),
  defineOperation('assets.getCleanup', ['GET', '/v1/asset-cleanups/:id']),
  defineOperation('assets.retryCleanup', ['POST', '/v1/asset-cleanups/:id/retries'], {
    idempotency: 'required',
  }),
] as const;
