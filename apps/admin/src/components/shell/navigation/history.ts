import type { NavigationController } from './controller';

const historyIndexKey = 'oneasterNavigationIndex';

interface Destination {
  index: number;
  href: string;
}

interface Restoration extends Destination {
  target: Destination;
}

interface HistoryRuntime {
  controller: NavigationController;
  browser: Window | null;
  current: Destination;
  restoring: Restoration | null;
  replay: Destination | null;
  expected: Map<string, 'push' | 'replace'>;
  snapshot: Record<string, unknown>;
}

export function createHistoryBridge(controller: NavigationController, initialHref: string) {
  const state: HistoryRuntime = {
    controller,
    browser: null,
    current: { index: 0, href: initialHref },
    restoring: null,
    replay: null,
    expected: new Map(),
    snapshot: {},
  };
  return {
    start: (browser: Window) => start(state, browser),
    prepare: (kind: 'push' | 'replace', href: string) => {
      state.expected.set(href, kind);
    },
    observe: (href: string) => observe(state, href),
  };
}

function relativeHref(browser: Window): string {
  return `${browser.location.pathname}${browser.location.search}${browser.location.hash}`;
}

function isHistoryRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function historyRecord(value: unknown): Record<string, unknown> {
  return isHistoryRecord(value) ? value : {};
}

function readIndex(value: unknown): number | null {
  const index = historyRecord(value)[historyIndexKey];
  return typeof index === 'number' && Number.isSafeInteger(index) ? index : null;
}

function mark(state: HistoryRuntime) {
  const { browser } = state;
  if (!browser) return;
  state.snapshot = {
    ...historyRecord(browser.history.state),
    [historyIndexKey]: state.current.index,
  };
  browser.history.replaceState(state.snapshot, '', browser.location.href);
}

function start(state: HistoryRuntime, browser: Window) {
  state.browser = browser;
  state.current = { index: readIndex(browser.history.state) ?? 0, href: relativeHref(browser) };
  mark(state);
  function onPop(event: PopStateEvent) {
    handlePop(state, event);
  }
  function onHash() {
    observe(state, relativeHref(browser));
  }
  browser.addEventListener('popstate', onPop, true);
  browser.addEventListener('hashchange', onHash);
  return () => {
    browser.removeEventListener('popstate', onPop, true);
    browser.removeEventListener('hashchange', onHash);
    state.browser = null;
    state.restoring = null;
    state.replay = null;
    state.expected.clear();
  };
}

function observe(state: HistoryRuntime, href: string) {
  const { browser, current, expected } = state;
  if (!browser) return;
  if (href !== current.href) {
    let kind = expected.get(href);
    if (href.split('#')[0] === current.href.split('#')[0]) {
      browser.history.replaceState(
        { ...state.snapshot, ...historyRecord(browser.history.state) },
        '',
        browser.location.href,
      );
      kind ??= 'push';
    }
    let { index } = current;
    if (kind === 'push') index += 1;
    else if (kind !== 'replace') index = readIndex(browser.history.state) ?? index + 1;
    state.current = { index, href };
    expected.delete(href);
  }
  mark(state);
  state.controller.observe(href);
  if (!state.controller.store.getState().active) expected.clear();
}

function handlePop(state: HistoryRuntime, event: PopStateEvent) {
  const { browser } = state;
  if (!browser) return;
  const index = readIndex(event.state);
  if (index === null) return;
  const target = { index, href: relativeHref(browser) };
  if (state.restoring) {
    finishRestoration(state, target, event);
    return;
  }
  if (state.replay) {
    finishReplay(state, target, event);
    return;
  }
  if (index === state.current.index) return;
  if (target.href.split('#')[0] === state.current.href.split('#')[0]) {
    state.current = target;
    state.snapshot = historyRecord(event.state);
    state.controller.observe(target.href);
    return;
  }
  if (state.controller.hasGuard()) {
    event.stopImmediatePropagation();
    state.restoring = { ...state.current, target };
    browser.history.go(state.current.index - index);
  } else {
    state.controller.request({ href: target.href, kind: 'traverse' }, () => {});
    state.current = target;
    state.snapshot = historyRecord(event.state);
  }
}

function finishRestoration(state: HistoryRuntime, target: Destination, event: PopStateEvent) {
  event.stopImmediatePropagation();
  const { restoring, browser } = state;
  if (!restoring || !browser) return;
  if (target.index !== restoring.index) {
    browser.history.go(restoring.index - target.index);
    return;
  }
  state.restoring = null;
  state.controller.request({ href: restoring.target.href, kind: 'traverse' }, () => {
    state.replay = restoring.target;
    browser.history.go(restoring.target.index - restoring.index);
  });
}

function finishReplay(state: HistoryRuntime, target: Destination, event: PopStateEvent) {
  const { replay, browser } = state;
  if (!replay || !browser) return;
  if (target.index !== replay.index) {
    event.stopImmediatePropagation();
    browser.history.go(replay.index - target.index);
    return;
  }
  state.current = target;
  state.snapshot = historyRecord(event.state);
  state.replay = null;
}
