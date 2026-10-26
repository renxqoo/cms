import type { StoreApi } from 'zustand/vanilla';
import type { ApiResult } from '../../api/result';
import type {
  AssetJob,
  ImageRecipe,
  ProcessingAccepted,
  UploadSession,
} from '../../contracts/assets';
import type { ApiFailure } from '../management-shared/query';
import type { PollingController, PollingState } from '../jobs/polling-types';
import type { AssetDocumentControlsProps, AssetWriteLease } from './document-asset-types';
import type { UploadQueueController } from './upload-queue-types';
import type { UploadServices } from './upload-requests';

export interface AssetWorkState {
  phase:
    | 'idle'
    | 'uploading'
    | 'processing'
    | 'consuming'
    | 'refreshing'
    | 'succeeded'
    | 'failed'
    | 'cancelled'
    | 'blocked';
  error: ApiFailure | null;
  paused: PollingState<unknown>['paused'];
  retryAt: number | null;
  job: AssetJob | null;
}
export interface AssetWorkServices {
  uploads: UploadServices;
  reprocess: (input: {
    collection: string;
    id: string;
    revision: number;
    recipe: ImageRecipe;
    key: string;
    signal: AbortSignal;
  }) => Promise<ApiResult<ProcessingAccepted>>;
  job: (input: {
    collection: string;
    id: string;
    signal: AbortSignal;
  }) => Promise<ApiResult<AssetJob>>;
}
export type AssetWorkOperation =
  | 'documents.update'
  | 'assets.createUpload'
  | 'assets.writeUpload'
  | 'assets.completeUpload'
  | 'assets.readUpload'
  | 'assets.cancelUpload'
  | 'assets.reprocess'
  | 'assets.download'
  | 'content.getJob';
export type AssetWorkInput = Pick<
  AssetDocumentControlsProps,
  'collection' | 'documentId' | 'revision' | 'budget'
> & {
  lease: AssetWriteLease;
  can: (operation: AssetWorkOperation) => boolean;
  report: (result: ApiResult<unknown>) => void;
  services?: AssetWorkServices;
} & ({ kind: 'replace'; file: File } | { kind: 'reprocess'; recipe: ImageRecipe });
export interface AssetWorkController {
  store: StoreApi<AssetWorkState>;
  queue: UploadQueueController | null;
  start: () => void;
  verify: () => void;
  cancel: () => void;
  canVerify: (can: AssetWorkInput['can']) => boolean;
  canCancel: (can: AssetWorkInput['can']) => boolean;
  dispose: () => void;
}
export interface AssetWorkRuntime {
  input: AssetWorkInput;
  store: StoreApi<AssetWorkState>;
  services: AssetWorkServices;
  controller: AbortController;
  signal: AbortSignal;
  queue: UploadQueueController | null;
  poller: PollingController<AssetJob> | null;
  stopPolling: (() => void) | null;
  receipt: ProcessingAccepted | null;
  session: UploadSession | null;
  key: string;
  active: boolean;
  disposed: boolean;
  finished: boolean;
  blocked: boolean;
  rejected: ApiFailure | null;
}
