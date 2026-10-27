import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import { requestApi } from '../../api/client';
import type { ApiResult } from '../../api/result';
import { editorLeaseSchema } from '../../contracts/collaboration';
import type { EditorLease } from '../../contracts/collaboration';
import type { ApiFailure } from '../management-shared/read-all-pages';

interface LeaseState {
  phase: 'loading' | 'owned' | 'occupied' | 'paused';
  value: EditorLease | null;
  error: ApiFailure | null;
}
interface LeaseOptions {
  collection: string;
  locale: string;
  id: string;
  editorId: string;
  report: (result: ApiResult<unknown>) => void;
}
interface LeaseRuntime {
  options: LeaseOptions;
  store: StoreApi<LeaseState>;
  active: AbortController | null;
  timer: ReturnType<typeof setTimeout> | undefined;
  expiry: ReturnType<typeof setTimeout> | undefined;
  disposed: boolean;
  epoch: number;
  releasing: Promise<unknown>;
}
function stop(runtime: LeaseRuntime) {
  runtime.active?.abort();
  runtime.active = null;
  clearTimeout(runtime.timer);
  clearTimeout(runtime.expiry);
}
function accept(runtime: LeaseRuntime, value: EditorLease) {
  runtime.store.setState({ value, error: null, phase: value.owned ? 'owned' : 'occupied' });
  if (!value.owned || !value.lease || !value.heartbeatMs) return;
  runtime.expiry = setTimeout(
    () => {
      stop(runtime);
      if (!runtime.disposed) runtime.store.setState({ phase: 'paused' });
    },
    Math.max(0, Date.parse(value.lease.expiresAt) - Date.now()),
  );
  runtime.timer = setTimeout(() => {
    void acquire(runtime, { generation: value.lease?.generation });
  }, value.heartbeatMs);
}
async function acquire(
  runtime: LeaseRuntime,
  input: { generation?: number | undefined; takeover?: boolean } = {},
) {
  if (runtime.disposed || runtime.active) return;
  clearTimeout(runtime.timer);
  const controller = new AbortController();
  runtime.active = controller;
  const result = await requestApi({
    operation: input.takeover ? 'documents.unlock' : 'documents.acquireLock',
    params: { collection: runtime.options.collection, id: runtime.options.id },
    body: {
      locale: runtime.options.locale,
      editorId: runtime.options.editorId,
      ...(input.generation === undefined ? {} : { generation: input.generation }),
    },
    response: editorLeaseSchema,
    signal: controller.signal,
  });
  if (runtime.disposed || runtime.active !== controller || controller.signal.aborted) return;
  runtime.active = null;
  clearTimeout(runtime.expiry);
  if (result.ok) accept(runtime, result.data);
  else {
    runtime.options.report(result);
    runtime.store.setState({ phase: 'paused', error: result });
  }
}
async function release(runtime: LeaseRuntime, value: EditorLease | null) {
  if (!value?.owned || !value.lease) return;
  await requestApi({
    operation: 'documents.releaseLock',
    params: { collection: runtime.options.collection, id: runtime.options.id },
    query: {
      locale: runtime.options.locale,
      editorId: runtime.options.editorId,
      generation: value.lease.generation,
    },
    response: editorLeaseSchema,
    signal: new AbortController().signal,
    keepalive: true,
  });
}
async function start(runtime: LeaseRuntime) {
  runtime.disposed = false;
  const current = ++runtime.epoch;
  await runtime.releasing;
  if (runtime.disposed || current !== runtime.epoch) return;
  runtime.store.setState({ phase: 'loading', error: null });
  await acquire(runtime);
}
function dispose(runtime: LeaseRuntime) {
  if (runtime.disposed) return;
  const { value } = runtime.store.getState();
  runtime.disposed = true;
  runtime.epoch += 1;
  stop(runtime);
  runtime.releasing = release(runtime, value);
}
export function createEditorLeaseController(options: LeaseOptions) {
  const runtime: LeaseRuntime = {
    options,
    store: createStore<LeaseState>(() => ({ phase: 'loading', value: null, error: null })),
    active: null,
    timer: undefined,
    expiry: undefined,
    disposed: true,
    epoch: 0,
    releasing: Promise.resolve(),
  };
  return {
    store: runtime.store,
    start: () => start(runtime),
    retry: () => acquire(runtime),
    takeover: () => {
      const generation = runtime.store.getState().value?.lease?.generation;
      return generation === undefined
        ? Promise.resolve()
        : acquire(runtime, { generation, takeover: true });
    },
    dispose: () => dispose(runtime),
  };
}
