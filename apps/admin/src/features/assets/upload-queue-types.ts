import type { StoreApi } from 'zustand/vanilla';
import type { UploadSession } from '../../contracts/assets';
import type { ApiResult } from '../../api/result';
import type { ApiFailure } from '../management-shared/query';
import type { PollingController, PollingInput, PollingState } from '../jobs/polling-types';
import type { AssetBudget } from './document-asset-types';
import type { UploadPermission } from './upload-permissions';
import type { UploadProgress, UploadServices, UploadTarget } from './upload-requests';

export type UploadStage =
  | 'queued'
  | 'preparing'
  | 'uploading'
  | 'completing'
  | 'processing'
  | 'ready'
  | 'consumed'
  | 'failed'
  | 'cancelled'
  | 'blocked';
export interface QueueUpload {
  id: string;
  file: File;
  stage: UploadStage;
  progress: UploadProgress;
  session: UploadSession | null;
  error: ApiFailure | null;
  paused: PollingState<unknown>['paused'];
  retryAt: number | null;
}
export interface UploadQueueState {
  items: QueueUpload[];
  stopped: boolean;
}
export interface UploadQueueInput {
  collection: string;
  budget: AssetBudget;
  purpose: 'create' | 'replace';
  target?: UploadTarget;
  concurrency: number;
  can: UploadPermission;
  onResult: (result: ApiResult<unknown>) => void;
  onReady?: (session: UploadSession) => void;
  onTerminal?: (session: UploadSession) => void;
  services?: UploadServices;
  visibility: PollingInput<UploadSession>['visibility'];
}
export interface UploadEntry {
  bytesWritten: boolean;
  createKey: string;
  completeKey: string;
  request: AbortController | null;
  poller: PollingController<UploadSession> | null;
  unsubscribe: (() => void) | null;
}
export interface UploadRuntime {
  input: UploadQueueInput;
  services: UploadServices;
  store: StoreApi<UploadQueueState>;
  entries: Map<string, UploadEntry>;
  disposed: boolean;
  pumping: boolean;
}
export interface UploadQueueController {
  store: StoreApi<UploadQueueState>;
  start: () => void;
  reconcile: () => void;
  add: (files: readonly File[]) => void;
  retry: (id: string) => void;
  verify: (id: string) => void;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  dispose: () => void;
}
