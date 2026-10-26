import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { ShellProvider } from '../../src/components/shell/shell-provider';
import type {
  NavigationAdapter,
  NavigationAttempt,
} from '../../src/components/shell/navigation/types';
import type { ApiResult } from '../../src/api/result';

const navigationListeners = new Set<(attempt: NavigationAttempt) => void>();
const adapter: NavigationAdapter = {
  subscribe(listener) {
    navigationListeners.add(listener);
    return () => {
      navigationListeners.delete(listener);
    };
  },
  commit: vi.fn<(attempt: NavigationAttempt) => void>(),
  cancel: vi.fn<(attempt: NavigationAttempt) => void>(),
};
export const ui = {
  denied: new Set<string>(),
  phase: 'ready' as 'ready' | 'loading' | 'failed',
  search: '',
  push: vi.fn<(href: string) => void>(),
  replace: vi.fn<(href: string) => void>(),
  report: vi.fn<(result: ApiResult<unknown>) => void>(),
  refresh: vi.fn<() => void>(),
  adapter,
  emitNavigation(attempt: NavigationAttempt) {
    for (const listener of navigationListeners) listener(attempt);
  },
};
export function access() {
  return {
    can: (operation: string) => !ui.denied.has(operation),
    phase: ui.phase,
    reportResult: ui.report,
    refresh: ui.refresh,
  };
}
export function Harness({
  children,
  locale = 'en',
}: {
  children: ReactNode;
  locale?: 'en' | 'zh';
}) {
  return (
    <ShellProvider initial={{ locale, theme: 'dark', sidebarOpen: true, collapsedGroups: [] }}>
      {children}
    </ShellProvider>
  );
}
export function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'request' },
  });
}
export function forbidden() {
  return json(
    { error: { code: 'forbidden', message: 'Denied', requestId: 'denied-request' } },
    403,
  );
}
export function resetUi() {
  ui.denied.clear();
  ui.phase = 'ready';
  ui.search = '';
  ui.push.mockClear();
  ui.replace.mockClear();
  ui.report.mockClear();
  ui.refresh.mockClear();
}

export function requestUrl(value: Parameters<typeof fetch>[0] | undefined): string {
  if (typeof value === 'string') return value;
  if (value instanceof URL) return value.href;
  return value instanceof Request ? value.url : '';
}
