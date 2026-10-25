import type { NavigationAdapter, NavigationAttempt } from '../shell/navigation/types';

interface LeaveGuardOptions {
  dirty: boolean;
  navigation: NavigationAdapter;
  onPendingChange(this: void, attempt: NavigationAttempt | null): void;
}

interface LeaveGuardState extends LeaveGuardOptions {
  pending: NavigationAttempt | null;
  disposed: boolean;
}

function requestLeave(state: LeaveGuardState, attempt: NavigationAttempt): void {
  if (state.disposed || state.pending) return;
  if (!state.dirty) {
    state.navigation.commit(attempt);
    return;
  }
  state.pending = attempt;
  state.onPendingChange(attempt);
}

function settleLeave(state: LeaveGuardState, confirmed: boolean): void {
  const attempt = state.pending;
  if (state.disposed || !attempt) return;
  state.pending = null;
  state.onPendingChange(null);
  if (confirmed) state.navigation.commit(attempt);
  else state.navigation.cancel(attempt);
}

function disposeLeave(state: LeaveGuardState): void {
  if (state.disposed) return;
  state.disposed = true;
  const attempt = state.pending;
  state.pending = null;
  if (attempt) state.navigation.cancel(attempt);
}

export function createLeaveGuard(options: LeaveGuardOptions) {
  const state: LeaveGuardState = { ...options, pending: null, disposed: false };
  return {
    request: (attempt: NavigationAttempt) => requestLeave(state, attempt),
    confirm: () => settleLeave(state, true),
    cancel: () => settleLeave(state, false),
    setDirty: (dirty: boolean) => {
      if (!state.disposed) state.dirty = dirty;
    },
    dispose: () => disposeLeave(state),
  };
}
