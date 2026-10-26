import { requestApi } from '../../api/client';
import { emptyResponseSchema } from '../../contracts/auth';
import { uploadSessionSchema, uploadWrittenSchema } from '../../contracts/assets';
import type { UploadSession } from '../../contracts/assets';
import type { ApiResult } from '../../api/result';

export interface UploadProgress {
  loaded: number;
  total: number | null;
}
export interface UploadTarget {
  id: string;
  revision: number;
}
export interface CreateUploadInput {
  collection: string;
  file: File;
  purpose: 'create' | 'replace';
  target?: UploadTarget;
  key: string;
  signal: AbortSignal;
}
export interface UploadServices {
  create: (input: CreateUploadInput) => Promise<ApiResult<UploadSession>>;
  write: (input: {
    collection: string;
    session: UploadSession;
    file: File;
    signal: AbortSignal;
    onProgress: (progress: UploadProgress) => void;
  }) => Promise<ApiResult<{ uploadId: string; bytes: number; digest: string }>>;
  complete: (input: {
    collection: string;
    uploadId: string;
    key: string;
    signal: AbortSignal;
  }) => Promise<ApiResult<UploadSession>>;
  read: (input: {
    collection: string;
    uploadId: string;
    signal: AbortSignal;
  }) => Promise<ApiResult<UploadSession>>;
  cancel: (input: {
    collection: string;
    uploadId: string;
    signal: AbortSignal;
  }) => Promise<ApiResult<undefined>>;
}

export const uploadServices: UploadServices = {
  create: ({ collection, file, purpose, target, key, signal }) =>
    requestApi({
      operation: 'assets.createUpload',
      params: { collection },
      body: {
        filename: file.name,
        mimeType: file.type,
        bytes: file.size,
        purpose,
        ...(target ? { documentId: target.id, revision: target.revision } : {}),
      },
      idempotencyKey: key,
      response: uploadSessionSchema,
      signal,
    }),
  write: ({ collection, session, file, signal, onProgress }) =>
    requestApi({
      operation: 'assets.writeUpload',
      params: { collection, uploadId: session.id },
      body: file,
      response: uploadWrittenSchema,
      signal,
      onUploadProgress: onProgress,
    }),
  complete: ({ collection, uploadId, key, signal }) =>
    requestApi({
      operation: 'assets.completeUpload',
      params: { collection, uploadId },
      body: {},
      idempotencyKey: key,
      response: uploadSessionSchema,
      signal,
    }),
  read: ({ collection, uploadId, signal }) =>
    requestApi({
      operation: 'assets.readUpload',
      params: { collection, uploadId },
      response: uploadSessionSchema,
      signal,
    }),
  cancel: ({ collection, uploadId, signal }) =>
    requestApi({
      operation: 'assets.cancelUpload',
      params: { collection, uploadId },
      response: emptyResponseSchema,
      signal,
    }),
};
