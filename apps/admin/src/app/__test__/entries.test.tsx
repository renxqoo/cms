import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { generateMetadata } from '../layout';
import HomePage from '../page';
import WorkbenchPage from '../ui/page';
import ListsPage from '../ui/lists/page';
import WorkbenchLayout from '../ui/layout';
import WorkbenchError from '../ui/error';
import { ShellProvider } from '../../components/shell/shell-provider';
import { parsePreferences } from '../../config/preferences';

const request = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = request.cookies.get(name);
        return value === undefined ? undefined : { value };
      },
    }),
}));
vi.mock('next/navigation', () => ({
  redirect: (href: string) => {
    throw new Error(`Redirect to ${href}`);
  },
  usePathname: () => '/ui',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>() }),
}));
vi.mock('../globals.css', () => ({}));

afterEach(() => {
  cleanup();
  request.cookies.clear();
});

it('the root redirects to the public component workbench', () => {
  expect(HomePage).toThrow('Redirect to /ui');
});

it('server rendering restores a matching language and theme before hydration', async () => {
  request.cookies.set('oneaster-locale', 'en');
  request.cookies.set('oneaster-theme', 'dark');
  request.cookies.set('oneaster-sidebar', 'false');
  const element = await RootLayout({ children: 'Synthetic workbench content' });
  const markup = renderToStaticMarkup(element);
  expect(markup).toContain('<html lang="en" class="dark" style="color-scheme:dark">');
  expect(markup).toContain('Synthetic workbench content');
  expect(await generateMetadata()).toMatchObject({ title: 'OneAster — Component workbench' });
  request.cookies.clear();
  const defaults = renderToStaticMarkup(await RootLayout({ children: 'Default language' }));
  expect(defaults).toContain('<html lang="zh-CN" style="color-scheme:light">');
  expect(await generateMetadata()).toMatchObject({ title: 'OneAster — 组件工作台' });
});

it('workbench route entries compose the actual overview and list components', () => {
  const overview = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({})}>
      {WorkbenchLayout({ children: WorkbenchPage() })}
    </ShellProvider>,
  );
  expect(overview).toContain('UI 组件工作台');
  const list = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      {WorkbenchLayout({ children: ListsPage() })}
    </ShellProvider>,
  );
  expect(list).toContain('Content list');
  expect(list).toContain('Welcome to OneAster');
});

it('the route error boundary shows a localized recovery action', () => {
  const reset = vi.fn<() => void>();
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <WorkbenchError reset={reset} />
    </ShellProvider>,
  );
  expect(
    screen.getByRole('heading', { name: 'This page could not be displayed' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(reset).toHaveBeenCalledOnce();
});
