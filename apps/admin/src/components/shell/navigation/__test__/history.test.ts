import { afterEach, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createNavigationController } from '../controller';
import { createHistoryBridge } from '../history';
import type { NavigationAttempt } from '../types';

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  window.history.replaceState(null, '', '/');
});

function fixture() {
  window.history.replaceState(
    { __NA: true, tree: { preserved: 'Next router state' } },
    '',
    '/ui/actions',
  );
  const controller = createNavigationController('/ui/actions');
  const bridge = createHistoryBridge(controller, '/ui/actions');
  const stop = bridge.start(window);
  function renderRoute() {
    bridge.observe(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  }
  window.addEventListener('popstate', renderRoute);
  cleanups.push(() => {
    stop();
    controller.dispose();
    window.removeEventListener('popstate', renderRoute);
  });
  function visit(href: string, kind: 'push' | 'replace' = 'push') {
    controller.request({ href, kind }, () => {
      bridge.prepare(kind, href);
      if (kind === 'push') window.history.pushState(window.history.state, '', href);
      else window.history.replaceState(window.history.state, '', href);
      bridge.observe(href);
    });
  }
  return { controller, bridge, stop, visit };
}

it('back and forward restore the current entry before confirmation and replay only the approved target', async () => {
  const { controller, visit } = fixture();
  visit('/ui/lists');
  visit('/ui/documents');
  const { length } = window.history;
  const attempts: NavigationAttempt[] = [];
  controller.adapter.subscribe((attempt) => {
    attempts.push(attempt);
  });
  window.history.back();
  await waitFor(() => expect(attempts).toHaveLength(1));
  expect(window.location.pathname).toBe('/ui/documents');
  const [cancelled] = attempts;
  if (!cancelled) throw new Error('Missing guarded back navigation');
  controller.adapter.cancel(cancelled);
  expect(window.location.pathname).toBe('/ui/documents');
  window.history.back();
  await waitFor(() => expect(attempts).toHaveLength(2));
  const approved = attempts.at(-1);
  if (!approved) throw new Error('Missing second guarded back navigation');
  controller.adapter.commit(approved);
  controller.adapter.commit(approved);
  await waitFor(() => expect(window.location.pathname).toBe('/ui/lists'));
  expect(controller.store.getState().lastEvent?.status).toBe('complete');
  window.history.forward();
  await waitFor(() => expect(attempts).toHaveLength(3));
  expect(window.location.pathname).toBe('/ui/lists');
  const forward = attempts.at(-1);
  if (!forward) throw new Error('Missing guarded forward navigation');
  controller.adapter.commit(forward);
  await waitFor(() => expect(window.location.pathname).toBe('/ui/documents'));
  expect(window.history.length).toBe(length);
  expect(window.history.state).toMatchObject({
    __NA: true,
    tree: { preserved: 'Next router state' },
  });
});

it('unguarded native traversal completes normally and replace preserves the entry count', async () => {
  const { controller, visit } = fixture();
  visit('/ui/inputs');
  const { length } = window.history;
  visit('/ui/feedback', 'replace');
  expect(window.history.length).toBe(length);
  window.history.back();
  await waitFor(() => expect(window.location.pathname).toBe('/ui/actions'));
  expect(controller.store.getState().active).toBeNull();
  expect(controller.store.getState().lastEvent?.status).toBe('complete');
});

it('unknown history entries are left to the native navigation and cleanup removes interception', async () => {
  window.history.replaceState({ nativeEntry: true }, '', '/outside-workbench');
  window.history.pushState({ __NA: true }, '', '/ui/documents');
  const controller = createNavigationController('/ui/documents');
  const bridge = createHistoryBridge(controller, '/ui/documents');
  bridge.observe('/ui/documents');
  const stop = bridge.start(window);
  const attempts: NavigationAttempt[] = [];
  controller.adapter.subscribe((attempt) => {
    attempts.push(attempt);
  });
  window.history.back();
  await waitFor(() => expect(window.location.pathname).toBe('/outside-workbench'));
  expect(attempts).toHaveLength(0);
  stop();
  controller.dispose();
  bridge.observe('/ui/lists');
});

it('hash navigation retains caller history state without patching global history methods', async () => {
  const originalMethods = Object.getOwnPropertyDescriptors(window.history);
  const { bridge, controller } = fixture();
  bridge.prepare('push', '/ui/actions#example');
  window.location.hash = '#example';
  await waitFor(() => expect(window.history.state).toMatchObject({ oneasterNavigationIndex: 1 }));
  expect(Object.getOwnPropertyDescriptors(window.history)).toEqual(originalMethods);
  expect(window.history.state).toMatchObject({
    __NA: true,
    tree: { preserved: 'Next router state' },
  });
  const attempts: NavigationAttempt[] = [];
  controller.adapter.subscribe((attempt) => {
    attempts.push(attempt);
  });
  window.history.back();
  await waitFor(() => expect(window.location.hash).toBe(''));
  expect(attempts).toHaveLength(0);
});

it.each([false, true])(
  'a hash after %s guarded traversal keeps the destination Next tree instead of the previous page tree',
  async (guarded) => {
    const { bridge, controller } = fixture();
    for (const [href, tree] of [
      ['/ui/lists', 'LISTS'],
      ['/ui/documents', 'DOCUMENTS'],
    ] as const) {
      bridge.prepare('push', href);
      window.history.pushState({ __NA: true, tree }, '', href);
      bridge.observe(href);
    }
    if (guarded) controller.adapter.subscribe((attempt) => controller.adapter.commit(attempt));
    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe('/ui/lists'));
    await waitFor(() => expect(controller.store.getState().active).toBeNull());
    expect(window.history.state).toMatchObject({ tree: 'LISTS' });
    window.location.hash = '#details';
    await waitFor(() => expect(window.history.state).toMatchObject({ oneasterNavigationIndex: 2 }));
    expect(window.history.state).toMatchObject({ __NA: true, tree: 'LISTS' });
  },
);

it('observing an unchanged href refreshes the Next history snapshot before a native hash entry', async () => {
  const { bridge } = fixture();
  window.history.replaceState(
    { ...window.history.state, tree: 'UPDATED' },
    '',
    window.location.href,
  );
  bridge.observe('/ui/actions');
  window.location.hash = '#details';
  await waitFor(() => expect(window.history.state).toMatchObject({ oneasterNavigationIndex: 1 }));
  expect(window.history.state).toMatchObject({ tree: 'UPDATED' });
});
