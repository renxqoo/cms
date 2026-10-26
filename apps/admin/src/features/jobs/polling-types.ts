import type { StoreApi } from 'zustand/vanilla';
import type { ApiResult } from '../../api/result';
import type { ApiFailure } from '../management-shared/query';

export interface PollingState<T> {
  phase: 'idle' | 'loading' | 'ready' | 'failed';
  data: T | null;
  error: ApiFailure | null;
  paused: 'hidden' | 'deadline' | 'failure' | 'limited' | null;
  retryAt: number | null;
  terminal: boolean;
}

export interface PollingInput<T> {
  intervalMs: number;
  budgetMs: number;
  read: (signal: AbortSignal) => Promise<ApiResult<T>>;
  terminal: (data: T) => boolean;
  onResult: (result: ApiResult<T>) => void;
  visibility: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
  now?: () => number;
}

export interface PollingController<T> {
  store: StoreApi<PollingState<T>>;
  start: () => void;
  resume: () => void;
  dispose: () => void;
}
