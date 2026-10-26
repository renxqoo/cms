import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import { requestApi } from '../../api/client';
import { assetJobSchema, processingAcceptedSchema } from '../../contracts/assets';
import { uploadServices } from './upload-requests';
import type { AssetWorkInput, AssetWorkOperation, AssetWorkServices } from './document-work-types';

export const assetWorkServices: AssetWorkServices = {
  uploads: uploadServices,
  reprocess: ({ collection, id, revision, recipe, key, signal }) =>
    requestApi({
      operation: 'assets.reprocess',
      params: { collection, id },
      body: { revision, recipe },
      response: processingAcceptedSchema,
      idempotencyKey: key,
      signal,
    }),
  job: ({ collection, id, signal }) =>
    requestApi({
      operation: 'content.getJob',
      params: { collection, jobId: id },
      response: assetJobSchema,
      signal,
    }),
};

export function permitsAssetWork(
  input: Pick<AssetWorkInput, 'can'>,
  operation: AssetWorkOperation,
) {
  const dependencies: AssetWorkOperation[] = [operation];
  if (operation === 'assets.reprocess')
    dependencies.push(
      'content.getJob',
      'assets.readUpload',
      'assets.download',
      'assets.cancelUpload',
    );
  else if (
    ['assets.createUpload', 'assets.writeUpload', 'assets.completeUpload'].includes(operation)
  )
    dependencies.push(
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.readUpload',
      'assets.cancelUpload',
      'documents.update',
    );
  else if (operation !== 'assets.readUpload') dependencies.push('assets.readUpload');
  return dependencies.every((dependency) => input.can(dependency));
}
function guarded<T>(
  input: AssetWorkInput,
  operation: AssetWorkOperation,
  run: () => Promise<ApiResult<T>>,
) {
  return permitsAssetWork(input, operation)
    ? run()
    : Promise.resolve(failure('forbidden', 403, { uncertain: true }));
}
export function authorizedAssetWorkServices(
  input: AssetWorkInput,
  services: AssetWorkServices,
): AssetWorkServices {
  const { uploads } = services;
  return {
    uploads: {
      create: (request) => guarded(input, 'assets.createUpload', () => uploads.create(request)),
      write: (request) => guarded(input, 'assets.writeUpload', () => uploads.write(request)),
      complete: (request) =>
        guarded(input, 'assets.completeUpload', () => uploads.complete(request)),
      read: (request) => guarded(input, 'assets.readUpload', () => uploads.read(request)),
      cancel: (request) => guarded(input, 'assets.cancelUpload', () => uploads.cancel(request)),
    },
    reprocess: (request) => guarded(input, 'assets.reprocess', () => services.reprocess(request)),
    job: (request) => guarded(input, 'content.getJob', () => services.job(request)),
  };
}
