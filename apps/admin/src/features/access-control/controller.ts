import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { AllowedOperation, VisibleNavigation } from '../../contracts/auth';
import type { ApiFailure } from '../management-shared/read-all-pages';
import { loadAccess } from './load-access';
import { operationKey } from './operation-key';

export interface AccessState {
  phase: 'loading' | 'ready' | 'failed';
  operations: readonly AllowedOperation[];
  navigation: readonly VisibleNavigation[];
  error: ApiFailure | null;
}

export interface OperationScope {
  scopeKind: 'global' | 'collection';
  collectionKey: string | null;
}

interface SnapshotState extends AccessState {
  source: string;
}

interface Runtime {
  source: string;
  onUnauthenticated: () => void;
  generation: number;
  active: AbortController | null;
  disposed: boolean;
  expired: boolean;
  keys: ReadonlySet<string>;
}

type AccessStore = StoreApi<SnapshotState>;

function emptyState(phase: AccessState['phase'], error: ApiFailure | null = null): AccessState {
  return { phase, operations: [], navigation: [], error };
}

async function refreshedAccess(signal: AbortSignal) {
  try {
    return await loadAccess(signal);
  } catch {
    return failure(signal.aborted ? 'request_cancelled' : 'invalid_response', 0);
  }
}

async function refreshAccess(store: AccessStore, runtime: Runtime): Promise<void> {
  if (runtime.disposed || runtime.expired) return;
  runtime.active?.abort();
  const active = new AbortController();
  const { source } = runtime;
  const generation = runtime.generation + 1;
  runtime.generation = generation;
  runtime.active = active;
  runtime.keys = new Set();
  store.setState({ ...emptyState('loading'), source });
  const result = await refreshedAccess(active.signal);
  if (runtime.disposed || active.signal.aborted || generation !== runtime.generation) return;
  runtime.active = null;
  runtime.keys = new Set(result.ok ? result.data.operations.map(operationKey) : []);
  store.setState(
    result.ok
      ? { phase: 'ready', ...result.data, error: null, source }
      : { ...emptyState('failed', result), source },
  );
  if (!result.ok) expireSession(result, runtime);
}

function allowed(store: AccessStore, runtime: Runtime, operation: AllowedOperation): boolean {
  const key = operationKey(operation);
  return (
    !runtime.disposed &&
    !runtime.expired &&
    store.getState().phase === 'ready' &&
    key !== '' &&
    runtime.keys.has(key)
  );
}

export function createAccessController(onUnauthenticated: () => void) {
  const store = createStore<SnapshotState>()(() => ({ ...emptyState('loading'), source: '' }));
  const runtime: Runtime = {
    source: '',
    onUnauthenticated,
    generation: 0,
    active: null,
    disposed: false,
    expired: false,
    keys: new Set(),
  };
  function refresh() {
    return refreshAccess(store, runtime);
  }
  return {
    store,
    refresh,
    can: (
      operationId: string,
      scope: OperationScope = { scopeKind: 'global', collectionKey: null },
    ) => allowed(store, runtime, { operationId, ...scope }),
    start(source = runtime.source) {
      runtime.source = source;
      runtime.disposed = false;
      return refresh();
    },
    reportResult(this: void, result: ApiResult<unknown>) {
      if (result.ok || runtime.disposed) return;
      if (result.status === 401 && result.error.code === 'unauthenticated') {
        runtime.keys = new Set();
        store.setState(emptyState('failed', result));
      }
      expireSession(result, runtime);
      if (result.status === 403 && store.getState().phase !== 'loading') void refresh();
    },
    dispose() {
      runtime.disposed = true;
      runtime.generation += 1;
      runtime.active?.abort();
      runtime.active = null;
    },
  };
}

function expireSession(result: ApiFailure, runtime: Runtime) {
  if (
    result.status === 401 &&
    result.error.code === 'unauthenticated' &&
    !runtime.expired &&
    !runtime.disposed
  ) {
    runtime.expired = true;
    runtime.keys = new Set();
    runtime.generation += 1;
    runtime.active?.abort();
    runtime.active = null;
    runtime.onUnauthenticated();
  }
}
