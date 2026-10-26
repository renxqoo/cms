import { createStore } from 'zustand/vanilla';
import { failure } from '../../api/result';
import type { ApiResult } from '../../api/result';
import type { PollingController, PollingInput, PollingState } from './polling-types';

interface PollingRuntime<T> {
  input: PollingInput<T>;
  store: PollingController<T>['store'];
  now: () => number;
  deadline: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  request: AbortController | null;
  disposed: boolean;
}

function stop<T>(runtime: PollingRuntime<T>) {
  clearTimeout(runtime.timer);
  runtime.request?.abort();
  runtime.request = null;
}

function pause<T>(runtime: PollingRuntime<T>, reason: PollingState<T>['paused']) {
  stop(runtime);
  runtime.store.setState({ paused: reason });
}

function complete<T>(runtime: PollingRuntime<T>, result: ApiResult<T>) {
  const { input, now, store } = runtime;
  clearTimeout(runtime.timer);
  input.onResult(result);
  if (!result.ok) {
    const limited = result.status === 429;
    store.setState({
      phase: 'failed',
      error: result,
      paused: limited ? 'limited' : 'failure',
      retryAt:
        limited && result.retryAfterSeconds !== null
          ? now() + result.retryAfterSeconds * 1000
          : null,
    });
    return;
  }
  const terminal = input.terminal(result.data);
  store.setState({
    phase: 'ready',
    data: result.data,
    error: null,
    paused: null,
    retryAt: null,
    terminal,
  });
  if (!terminal && !runtime.disposed)
    runtime.timer = setTimeout(
      () => {
        void read(runtime);
      },
      Math.min(input.intervalMs, Math.max(0, runtime.deadline - now())),
    );
}

async function read<T>(runtime: PollingRuntime<T>) {
  if (runtime.disposed) return;
  if (runtime.now() >= runtime.deadline) {
    pause(runtime, 'deadline');
    return;
  }
  if (runtime.input.visibility.visibilityState === 'hidden') {
    pause(runtime, 'hidden');
    return;
  }
  stop(runtime);
  const request = new AbortController();
  runtime.request = request;
  runtime.store.setState({ phase: 'loading', paused: null });
  runtime.timer = setTimeout(
    () => pause(runtime, 'deadline'),
    Math.max(0, runtime.deadline - runtime.now()),
  );
  let result: ApiResult<T>;
  try {
    result = await runtime.input.read(request.signal);
  } catch {
    result = failure('request_failed', 0);
  }
  if (runtime.disposed || request.signal.aborted || runtime.request !== request) return;
  runtime.request = null;
  complete(runtime, result);
}

function visibility<T>(runtime: PollingRuntime<T>) {
  const { terminal, paused } = runtime.store.getState();
  if (terminal || (paused !== null && paused !== 'hidden')) return;
  if (runtime.input.visibility.visibilityState === 'hidden') pause(runtime, 'hidden');
  else if (paused === 'hidden') void read(runtime);
}

function resume<T>(runtime: PollingRuntime<T>) {
  if (runtime.disposed || (runtime.store.getState().retryAt ?? 0) > runtime.now()) return;
  runtime.deadline = runtime.now() + runtime.input.budgetMs;
  void read(runtime);
}

export function createPolling<T>(input: PollingInput<T>): PollingController<T> {
  const now = input.now ?? Date.now;
  const store = createStore<PollingState<T>>(() => ({
    phase: 'idle',
    data: null,
    error: null,
    paused: null,
    retryAt: null,
    terminal: false,
  }));
  const runtime: PollingRuntime<T> = {
    input,
    store,
    now,
    deadline: now() + input.budgetMs,
    timer: undefined,
    request: null,
    disposed: false,
  };
  const observe = () => visibility(runtime);
  return {
    store,
    start() {
      runtime.disposed = false;
      input.visibility.addEventListener('visibilitychange', observe);
      void read(runtime);
    },
    resume: () => resume(runtime),
    dispose() {
      runtime.disposed = true;
      stop(runtime);
      input.visibility.removeEventListener('visibilitychange', observe);
    },
  };
}
