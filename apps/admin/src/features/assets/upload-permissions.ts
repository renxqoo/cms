import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { UploadServices } from './upload-requests';

export type UploadOperation =
  | 'assets.createUpload'
  | 'assets.writeUpload'
  | 'assets.completeUpload'
  | 'assets.readUpload'
  | 'assets.cancelUpload';
export type UploadPermission = (operation: UploadOperation) => boolean;

export function permitsUpload(can: UploadPermission, operation: UploadOperation) {
  const required: UploadOperation[] = [operation, 'assets.readUpload'];
  if (
    operation === 'assets.createUpload' ||
    operation === 'assets.writeUpload' ||
    operation === 'assets.completeUpload'
  )
    required.push(
      'assets.createUpload',
      'assets.writeUpload',
      'assets.completeUpload',
      'assets.cancelUpload',
    );
  return required.every((dependency) => can(dependency));
}
function guarded<T>(can: boolean, run: () => Promise<ApiResult<T>>) {
  return can ? run() : Promise.resolve(failure('forbidden', 403, { uncertain: true }));
}
export function authorizedUploadServices(
  services: UploadServices,
  can: UploadPermission,
): UploadServices {
  return {
    create: (request) =>
      guarded(permitsUpload(can, 'assets.createUpload'), () => services.create(request)),
    write: (request) =>
      guarded(permitsUpload(can, 'assets.writeUpload'), () => services.write(request)),
    complete: (request) =>
      guarded(permitsUpload(can, 'assets.completeUpload'), () => services.complete(request)),
    read: (request) =>
      guarded(permitsUpload(can, 'assets.readUpload'), () => services.read(request)),
    cancel: (request) =>
      guarded(permitsUpload(can, 'assets.cancelUpload'), () => services.cancel(request)),
  };
}
