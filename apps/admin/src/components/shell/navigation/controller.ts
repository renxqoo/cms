import { createStore } from 'zustand/vanilla';
import type { StoreApi } from 'zustand/vanilla';
import type { NavigationAdapter, NavigationAttempt, NavigationState } from './types';

interface Runtime {
  store: StoreApi<NavigationState>;
  requested: Set<string>;
  currentHref: string;
  nextId: number;
  guard: ((attempt: NavigationAttempt) => void) | null;
  pending: NavigationAttempt | null;
  execute: (() => void) | null;
}

export function createNavigationController(initialHref: string) {
  const runtime: Runtime = {
    store: createStore<NavigationState>()(() => ({ active: null, lastEvent: null, failed: false })),
    requested: new Set(),
    currentHref: initialHref,
    nextId: 0,
    guard: null,
    pending: null,
    execute: null,
  };
  return {
    adapter: createAdapter(runtime),
    store: runtime.store,
    hasGuard: () => runtime.guard !== null,
    request: (input: Pick<NavigationAttempt, 'href' | 'kind'>, execute: () => void) =>
      request(runtime, input, execute),
    observe: (href: string) => observe(runtime, href),
    dispose: () => {
      runtime.pending = null;
      runtime.execute = null;
      runtime.guard = null;
      runtime.requested.clear();
      cancelActive(runtime);
    },
  };
}

function createAdapter(runtime: Runtime): NavigationAdapter {
  return {
    subscribe: (listener) => {
      if (runtime.guard)
        throw new Error('Aggregate document changes into one navigation guard per page');
      runtime.guard = listener;
      return () => {
        if (runtime.guard === listener) runtime.guard = null;
      };
    },
    commit: (attempt) => commit(runtime, attempt),
    cancel: (attempt) => cancel(runtime, attempt),
  };
}

function cancelActive(runtime: Runtime, failed = false) {
  const { active } = runtime.store.getState();
  if (active)
    runtime.store.setState({
      active: null,
      failed,
      lastEvent: { attempt: active, status: 'cancel' },
    });
}

function commit(runtime: Runtime, attempt: NavigationAttempt) {
  if (runtime.pending?.id !== attempt.id) return;
  const { execute } = runtime;
  runtime.pending = null;
  runtime.execute = null;
  cancelActive(runtime);
  runtime.requested.add(attempt.href);
  runtime.store.setState({
    active: attempt,
    failed: false,
    lastEvent: { attempt, status: 'start' },
  });
  try {
    execute?.();
  } catch {
    cancelActive(runtime, true);
  }
}

function cancel(runtime: Runtime, attempt: NavigationAttempt) {
  if (runtime.pending?.id !== attempt.id) return;
  runtime.pending = null;
  runtime.execute = null;
  runtime.store.setState({ lastEvent: { attempt, status: 'cancel' } });
}

function request(
  runtime: Runtime,
  input: Pick<NavigationAttempt, 'href' | 'kind'>,
  execute: () => void,
) {
  if (runtime.pending || input.href === runtime.currentHref) return null;
  const attempt = { ...input, id: `navigation-${++runtime.nextId}` };
  runtime.pending = attempt;
  runtime.execute = execute;
  if (runtime.guard) {
    try {
      runtime.guard(attempt);
    } catch {
      cancel(runtime, attempt);
      runtime.store.setState({ failed: true });
    }
  } else commit(runtime, attempt);
  return attempt;
}

function observe(runtime: Runtime, href: string) {
  runtime.currentHref = href;
  const { active } = runtime.store.getState();
  if (active?.href === href) {
    runtime.requested.clear();
    runtime.store.setState({ active: null, lastEvent: { attempt: active, status: 'complete' } });
  } else if (active && !runtime.requested.has(href)) {
    runtime.requested.clear();
    cancelActive(runtime);
  }
}

export type NavigationController = ReturnType<typeof createNavigationController>;
