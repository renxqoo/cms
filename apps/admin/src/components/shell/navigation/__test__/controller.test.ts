import { expect, it, vi } from 'vitest';
import { createNavigationController } from '../controller';
import type { NavigationAttempt } from '../types';

it('navigation progress starts only after approval and completes on the actual target', () => {
  const navigation = createNavigationController('/ui/documents');
  const execute = vi.fn<() => void>();
  let attempt: NavigationAttempt | undefined;
  navigation.adapter.subscribe((value) => {
    attempt = value;
  });
  navigation.request({ href: '/ui/lists', kind: 'push' }, execute);
  expect(execute).not.toHaveBeenCalled();
  expect(navigation.store.getState().active).toBeNull();
  expect(attempt).toBeDefined();
  if (!attempt) throw new Error('Missing navigation request');
  navigation.adapter.commit(attempt);
  navigation.adapter.commit(attempt);
  expect(execute).toHaveBeenCalledOnce();
  expect(navigation.store.getState().lastEvent?.status).toBe('start');
  navigation.observe('/ui/lists');
  expect(navigation.store.getState().active).toBeNull();
  expect(navigation.store.getState().lastEvent?.status).toBe('complete');
});

it('pending guards keep the first target and cancel never replays it', () => {
  const navigation = createNavigationController('/ui/documents');
  const execute = vi.fn<() => void>();
  const listener = vi.fn<(attempt: NavigationAttempt) => void>();
  navigation.adapter.subscribe(listener);
  const first = navigation.request({ href: '/ui/lists', kind: 'push' }, execute);
  expect(navigation.request({ href: '/ui', kind: 'replace' }, execute)).toBeNull();
  expect(listener).toHaveBeenCalledOnce();
  if (!first) throw new Error('Missing first navigation');
  navigation.adapter.cancel(first);
  navigation.adapter.commit(first);
  expect(execute).not.toHaveBeenCalled();
  expect(navigation.store.getState().lastEvent?.status).toBe('cancel');
});

it('one aggregated guard is enforced and subscriptions may replay after cleanup', () => {
  const navigation = createNavigationController('/ui');
  const listener = vi.fn<(attempt: NavigationAttempt) => void>();
  const unsubscribe = navigation.adapter.subscribe(listener);
  expect(() => navigation.adapter.subscribe(listener)).toThrow('one navigation guard');
  unsubscribe();
  unsubscribe();
  expect(navigation.hasGuard()).toBe(false);
  navigation.adapter.subscribe(listener);
  expect(navigation.hasGuard()).toBe(true);
  navigation.dispose();
  expect(navigation.hasGuard()).toBe(false);
  expect(() => navigation.adapter.subscribe(listener)).not.toThrow();
});

it('superseded route progress ignores an older intermediate commit', () => {
  const navigation = createNavigationController('/ui');
  const execute = vi.fn<() => void>();
  navigation.request({ href: '/ui/lists?q=first', kind: 'push' }, execute);
  const latest = navigation.request({ href: '/ui/lists?q=latest', kind: 'replace' }, execute);
  navigation.observe('/ui/lists?q=first');
  expect(navigation.store.getState().active).toEqual(latest);
  navigation.observe('/ui/lists?q=latest');
  expect(navigation.store.getState().lastEvent?.status).toBe('complete');
  expect(navigation.request({ href: '/ui/lists?q=latest', kind: 'push' }, execute)).toBeNull();
});

it('external navigation and execution failures stop progress without exposing raw errors', () => {
  const navigation = createNavigationController('/ui');
  navigation.request({ href: '/ui/inputs', kind: 'push' }, () => {
    throw new Error('Private transport details');
  });
  expect(navigation.store.getState()).toMatchObject({ active: null, failed: true });
  navigation.request({ href: '/ui/actions', kind: 'push' }, () => {});
  navigation.observe('/ui/layout');
  expect(navigation.store.getState()).toMatchObject({
    active: null,
    lastEvent: { status: 'cancel' },
  });
});

it('a failing guard cancels its request and a cleaned guard can be replaced before navigation resumes', () => {
  const navigation = createNavigationController('/ui/documents');
  const execute = vi.fn<() => void>();
  const stop = navigation.adapter.subscribe(() => {
    throw new Error('Private guard detail');
  });
  navigation.request({ href: '/ui/lists', kind: 'push' }, execute);
  expect(navigation.store.getState()).toMatchObject({
    active: null,
    failed: true,
    lastEvent: { status: 'cancel' },
  });
  expect(execute).not.toHaveBeenCalled();
  stop();
  navigation.adapter.subscribe((attempt) => navigation.adapter.commit(attempt));
  navigation.request({ href: '/ui/lists', kind: 'push' }, execute);
  navigation.observe('/ui/lists');
  expect(execute).toHaveBeenCalledOnce();
  expect(navigation.store.getState()).toMatchObject({
    active: null,
    failed: false,
    lastEvent: { status: 'complete' },
  });
});
