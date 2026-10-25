import { expect, it, vi } from 'vitest';
import { createLeaveGuard } from '../leave-guard.ts';
import type { NavigationAdapter, NavigationAttempt } from '../../shell/navigation/types';

function fixture(dirty = true) {
  const commit = vi.fn<NavigationAdapter['commit']>();
  const cancel = vi.fn<NavigationAdapter['cancel']>();
  const onPendingChange = vi.fn<(attempt: NavigationAttempt | null) => void>();
  const navigation: NavigationAdapter = { subscribe: () => () => {}, commit, cancel };
  const guard = createLeaveGuard({ dirty, navigation, onPendingChange });
  return { guard, commit, cancel, onPendingChange };
}

const target: NavigationAttempt = { id: 'first', href: '/ui/data', kind: 'push' };

it('commits clean navigation immediately without opening a confirmation', () => {
  const { guard, commit, onPendingChange } = fixture(false);
  guard.request(target);
  expect(commit).toHaveBeenCalledWith(target);
  expect(onPendingChange).not.toHaveBeenCalled();
});

it('holds the first dirty target and confirms it exactly once', () => {
  const { guard, commit, onPendingChange } = fixture();
  guard.request(target);
  guard.request({ id: 'later', href: '/ui/inputs', kind: 'replace' });
  expect(commit).not.toHaveBeenCalled();
  expect(onPendingChange).toHaveBeenCalledExactlyOnceWith(target);
  guard.confirm();
  guard.confirm();
  expect(onPendingChange).toHaveBeenLastCalledWith(null);
  expect(commit).toHaveBeenCalledExactlyOnceWith(target);
});

it('cancels a dirty target and permits a later attempt to be confirmed', () => {
  const { guard, commit, cancel } = fixture();
  const later: NavigationAttempt = { id: 'later', href: '/ui/inputs', kind: 'traverse' };
  guard.request(target);
  guard.cancel();
  guard.cancel();
  expect(cancel).toHaveBeenCalledExactlyOnceWith(target);
  expect(commit).not.toHaveBeenCalled();
  guard.request(later);
  guard.confirm();
  expect(commit).toHaveBeenCalledExactlyOnceWith(later);
});

it('keeps an existing confirmation pending when dirty becomes false', () => {
  const { guard, commit, cancel } = fixture();
  guard.request(target);
  guard.setDirty(false);
  expect(commit).not.toHaveBeenCalled();
  guard.cancel();
  expect(cancel).toHaveBeenCalledExactlyOnceWith(target);
  guard.request({ id: 'clean', href: '/ui', kind: 'push' });
  expect(commit).toHaveBeenCalledExactlyOnceWith({ id: 'clean', href: '/ui', kind: 'push' });
});

it('disposal rejects the pending target and prevents stale navigation from committing', () => {
  const { guard, commit, cancel, onPendingChange } = fixture();
  guard.request(target);
  onPendingChange.mockClear();
  guard.dispose();
  guard.dispose();
  guard.request(target);
  guard.confirm();
  guard.cancel();
  guard.setDirty(false);
  expect(cancel).toHaveBeenCalledExactlyOnceWith(target);
  expect(commit).not.toHaveBeenCalled();
  expect(onPendingChange).not.toHaveBeenCalled();
});

it('disposal without a pending attempt does not create navigation callbacks', () => {
  const { guard, commit, cancel } = fixture();
  guard.dispose();
  expect(cancel).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
});
