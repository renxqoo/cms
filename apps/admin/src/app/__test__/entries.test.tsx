import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import RootLayout, { generateMetadata } from '../layout';
import HomePage from '../page';
import WorkbenchPage from '../ui/page';
import ListsPage from '../ui/lists/page';
import WorkbenchLayout from '../ui/layout';
import WorkbenchError from '../ui/error';
import ActionsPage from '../ui/actions/page';
import InputsPage from '../ui/inputs/page';
import LayoutPage from '../ui/layout/page';
import FeedbackPage from '../ui/feedback/page';
import DataPage from '../ui/data/page';
import OverlaysPage from '../ui/overlays/page';
import DocumentsPage from '../ui/documents/page';
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

it('the root enters the authenticated application', () => {
  expect(HomePage).toThrow('Redirect to /dashboard');
});

it('server rendering restores a matching language and theme before hydration', async () => {
  request.cookies.set('oneaster-locale', 'en');
  request.cookies.set('oneaster-theme', 'dark');
  request.cookies.set('oneaster-sidebar', 'false');
  const element = await RootLayout({ children: 'Synthetic workbench content' });
  const markup = renderToStaticMarkup(element);
  expect(markup).toContain('<html lang="en" class="dark" style="color-scheme:dark">');
  expect(markup).toContain('Synthetic workbench content');
  expect(await generateMetadata()).toMatchObject({ title: 'OneAster — Content management' });
  request.cookies.clear();
  const defaults = renderToStaticMarkup(await RootLayout({ children: 'Default language' }));
  expect(defaults).toContain('<html lang="zh-CN" style="color-scheme:light">');
  expect(await generateMetadata()).toMatchObject({ title: 'OneAster — 内容管理' });
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

it.each([
  [ActionsPage, '复制品牌名称'],
  [InputsPage, '登录表单组件'],
  [LayoutPage, '展开更多内容'],
  [FeedbackPage, '共享加载与并发'],
  [DataPage, '表格与列表控制'],
  [OverlaysPage, '打开示例表单'],
  [DocumentsPage, '文档、关系与媒体'],
])('each category server entry renders its actual interactive scenario', (Page, expected) => {
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({})}>
      {WorkbenchLayout({ children: Page() })}
    </ShellProvider>,
  );
  expect(markup).toContain(expected);
});
