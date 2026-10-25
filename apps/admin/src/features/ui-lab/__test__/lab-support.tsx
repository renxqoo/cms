import { afterEach, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { AppShell } from '../../../components/shell/app-shell';
import { parsePreferences } from '../../../config/preferences';

const labRouter = vi.hoisted(() => ({
  pathname: '/ui',
  search: '',
  push: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
  replace: vi.fn<(href: string, options?: { scroll?: boolean }) => void>(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => labRouter.pathname,
  useSearchParams: () => new URLSearchParams(labRouter.search),
  useRouter: () => ({ push: labRouter.push, replace: labRouter.replace }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

export function renderLab(
  content: ReactNode,
  options: { locale?: 'zh' | 'en'; pathname?: string } = {},
) {
  const pathname = options.pathname ?? '/ui';
  labRouter.pathname = pathname;
  labRouter.search = '';
  window.history.replaceState({ __NA: true }, '', pathname);
  return render(
    <ShellProvider initial={parsePreferences({ locale: options.locale })}>
      <AppShell>{content}</AppShell>
    </ShellProvider>,
  );
}
