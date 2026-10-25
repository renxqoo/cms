import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { UnsavedChangesGuard, useUnsavedChanges } from '../unsaved-changes';
import type { NavigationAdapter, NavigationAttempt } from '../../shell/navigation/types';

afterEach(cleanup);

function navigationFixture() {
  let listener: ((attempt: NavigationAttempt) => void) | undefined;
  const unsubscribe = vi.fn<() => void>();
  const commit = vi.fn<NavigationAdapter['commit']>();
  const cancel = vi.fn<NavigationAdapter['cancel']>();
  const navigation: NavigationAdapter = {
    subscribe(next) {
      listener = next;
      return unsubscribe;
    },
    commit,
    cancel,
  };
  return {
    navigation,
    commit,
    cancel,
    unsubscribe,
    attempt(value: NavigationAttempt) {
      if (!listener) throw new Error('Navigation subscriber missing');
      listener(value);
    },
  };
}

function Wrapper({ children }: { children: ReactNode }) {
  return <StrictMode>{children}</StrictMode>;
}

const attempt: NavigationAttempt = { id: 'navigation', href: '/ui/data', kind: 'push' };

const labels = {
  title: 'Unsaved changes',
  description: 'Leave without saving?',
  confirm: 'Leave page',
  cancel: 'Keep editing',
  close: 'Close',
};

it('cancels adapted navigation without discarding the editing form', () => {
  const fixture = navigationFixture();
  render(
    <UnsavedChangesGuard dirty navigation={fixture.navigation} labels={labels}>
      <input aria-label="Title" defaultValue="Draft title" />
    </UnsavedChangesGuard>,
  );
  act(() => fixture.attempt(attempt));
  expect(screen.getByRole('dialog').textContent).toContain('Unsaved changes');
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect(fixture.cancel).toHaveBeenCalledExactlyOnceWith(attempt);
  expect(fixture.commit).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Title')).toHaveProperty('value', 'Draft title');
});

it('confirms the original adapted target only once', () => {
  const fixture = navigationFixture();
  const { result } = renderHook(() =>
    useUnsavedChanges({ dirty: true, navigation: fixture.navigation }),
  );
  act(() => result.current.requestNavigation(attempt));
  expect(result.current.pending).toEqual(attempt);
  act(() => result.current.confirm());
  act(() => result.current.confirm());
  expect(fixture.commit).toHaveBeenCalledExactlyOnceWith(attempt);
  expect(result.current.pending).toBeNull();
});

it('installs unload protection only while dirty and removes it on unmount', () => {
  const fixture = navigationFixture();
  const { rerender, unmount } = renderHook(
    ({ dirty }) => useUnsavedChanges({ dirty, navigation: fixture.navigation }),
    { initialProps: { dirty: true } },
  );
  const dirtyEvent = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(dirtyEvent);
  expect(dirtyEvent.defaultPrevented).toBe(true);
  rerender({ dirty: false });
  const cleanEvent = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(cleanEvent);
  expect(cleanEvent.defaultPrevented).toBe(false);
  rerender({ dirty: true });
  unmount();
  const unmountedEvent = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unmountedEvent);
  expect(unmountedEvent.defaultPrevented).toBe(false);
  expect(fixture.unsubscribe).toHaveBeenCalledTimes(1);
});

it('keeps the navigation subscription operational after StrictMode effect replay', () => {
  const fixture = navigationFixture();
  const { result } = renderHook(
    () => useUnsavedChanges({ dirty: true, navigation: fixture.navigation }),
    {
      wrapper: Wrapper,
    },
  );
  act(() => fixture.attempt(attempt));
  expect(result.current.pending).toEqual(attempt);
  act(() => result.current.confirm());
  expect(fixture.commit).toHaveBeenCalledExactlyOnceWith(attempt);
});

it('discards an old adapter confirmation and keeps a replacement adapter isolated', () => {
  const first = navigationFixture();
  const second = navigationFixture();
  const { result, rerender, unmount } = renderHook(
    ({ navigation }) => useUnsavedChanges({ dirty: true, navigation }),
    { initialProps: { navigation: first.navigation } },
  );
  act(() => first.attempt(attempt));
  expect(result.current.pending).toEqual(attempt);
  rerender({ navigation: second.navigation });
  expect(first.cancel).toHaveBeenCalledExactlyOnceWith(attempt);
  expect(first.unsubscribe).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBeNull();
  act(() => second.attempt({ ...attempt, id: 'second' }));
  expect(result.current.pending?.id).toBe('second');
  act(() => result.current.cancel());
  expect(second.cancel).toHaveBeenCalledExactlyOnceWith({ ...attempt, id: 'second' });
  const stale = result.current;
  unmount();
  stale.confirm();
  stale.cancel();
  stale.requestNavigation(attempt);
  expect(second.commit).not.toHaveBeenCalled();
});
