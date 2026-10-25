import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { parsePreferences } from '../../../config/preferences';
import { AppShell } from '../../../components/shell/app-shell';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { Overview } from '../overview';
import { ListWorkbench } from '../list-workbench';

const navigation = vi.hoisted(() => ({
  query: '',
  pathname: '/ui/lists',
  push: vi.fn<(href: string, options?: { scroll: boolean }) => void>(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: navigation.push }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.query),
}));

function example(content: ReactNode, locale = 'zh') {
  return (
    <ShellProvider initial={parsePreferences({ locale })}>
      <AppShell>{content}</AppShell>
    </ShellProvider>
  );
}

afterEach(() => {
  cleanup();
  navigation.query = '';
  navigation.pathname = '/ui/lists';
  navigation.push.mockReset();
});

it('overview navigation retains link semantics when styled as a button', () => {
  render(example(<Overview />));
  expect(screen.getByRole('heading', { level: 1, name: 'UI 组件工作台' })).toBeInTheDocument();
  expect(screen.getByText(/这里的内容均为合成示例/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: '打开场景' })).toHaveAttribute('href', '/ui/lists');
  fireEvent.click(screen.getByRole('button', { name: '切换语言' }));
  expect(
    screen.getByRole('heading', { level: 1, name: 'UI component workbench' }),
  ).toBeInTheDocument();
});

it('creates and edits only local examples while preserving invalid form input', async () => {
  render(example(<ListWorkbench />));
  fireEvent.click(screen.getByRole('button', { name: '添加本地示例' }));
  const title = screen.getByRole('textbox', { name: '内容标题' });
  fireEvent.change(title, { target: { value: ' ' } });
  fireEvent.click(screen.getByRole('button', { name: '应用到本地示例' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('请输入内容标题。');
  expect(title).toHaveValue(' ');
  fireEvent.change(title, { target: { value: 'Local sample' } });
  fireEvent.change(screen.getByRole('textbox', { name: '分类' }), {
    target: { value: 'Local category' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: '状态' }), {
    target: { value: 'published' },
  });
  fireEvent.click(screen.getByRole('button', { name: '应用到本地示例' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Local sample')).toBeInTheDocument();
  expect(screen.getByText(/刷新页面会还原初始示例/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '编辑本地示例 · Local sample' }));
  const edited = screen.getByRole('textbox', { name: '内容标题' });
  expect(edited).toHaveValue('Local sample');
  fireEvent.change(edited, { target: { value: 'Edited local sample' } });
  fireEvent.click(screen.getByRole('button', { name: '应用到本地示例' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Edited local sample')).toBeInTheDocument();
  expect(screen.queryByText('Local sample')).not.toBeInTheDocument();
});

it('search, filter and sort actions update the URL without losing legitimate list parameters', () => {
  navigation.query = 'status=draft&page=2&pageSize=5';
  render(example(<ListWorkbench />));
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索内容' }), {
    target: { value: '指南' },
  });
  fireEvent.click(screen.getByRole('button', { name: '搜索' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?status=draft&pageSize=5&q=%E6%8C%87%E5%8D%97',
    { scroll: false },
  );
  fireEvent.change(screen.getByRole('combobox', { name: '按状态筛选' }), {
    target: { value: 'published' },
  });
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?status=published&pageSize=5&q=%E6%8C%87%E5%8D%97',
    {
      scroll: false,
    },
  );
  fireEvent.click(screen.getByRole('button', { name: '标题' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?status=published&pageSize=5&q=%E6%8C%87%E5%8D%97&sort=title&order=asc',
    { scroll: false },
  );
});

it('selection remains limited to the visible page and the empty state stays usable', () => {
  const view = render(example(<ListWorkbench />));
  fireEvent.click(screen.getByRole('checkbox', { name: '选择当前页可选内容' }));
  expect(screen.getByText('已选择 5 条')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '清空选择' }));
  expect(screen.queryByText('已选择 5 条')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '下一页' }));
  expect(navigation.push).toHaveBeenLastCalledWith('/ui/lists?page=2', { scroll: false });
  navigation.query = 'page=2';
  view.rerender(example(<ListWorkbench />));
  expect(screen.getByText('发布前检查清单')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: '每页条数' }), { target: { value: '10' } });
  expect(navigation.push).toHaveBeenLastCalledWith('/ui/lists?page=1&pageSize=10', {
    scroll: false,
  });
  navigation.query = 'q=does-not-exist&page=999';
  view.rerender(example(<ListWorkbench />));
  expect(screen.getByText('没有匹配的内容，请调整搜索或筛选条件。')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
});

it('switching language and theme leaves an unfinished search untouched', () => {
  render(example(<ListWorkbench />));
  const search = screen.getByRole('searchbox', { name: '搜索内容' });
  fireEvent.change(search, { target: { value: 'A draft query' } });
  fireEvent.click(screen.getByRole('button', { name: '切换语言' }));
  expect(screen.getByRole('searchbox', { name: 'Search content' })).toHaveValue('A draft query');
  fireEvent.click(screen.getByRole('button', { name: 'Toggle theme' }));
  expect(document.documentElement).toHaveClass('dark');
  expect(screen.getByRole('searchbox', { name: 'Search content' })).toHaveValue('A draft query');
});

it('rapid search, filtering, sorting and page-size changes retain the search before navigation commits', () => {
  navigation.query = 'pageSize=5';
  render(example(<ListWorkbench />));
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索内容' }), {
    target: { value: '媒体' },
  });
  fireEvent.click(screen.getByRole('button', { name: '搜索' }));
  fireEvent.change(screen.getByRole('combobox', { name: '按状态筛选' }), {
    target: { value: 'draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: '更新时间' }));
  fireEvent.change(screen.getByRole('combobox', { name: '每页条数' }), { target: { value: '10' } });
  const last = navigation.push.mock.calls.at(-1);
  expect(last).toBeDefined();
  const target = new URL(last?.[0] ?? '', 'https://oneaster.example');
  expect(target.searchParams.get('q')).toBe('媒体');
  expect(target.searchParams.get('status')).toBe('draft');
  expect(target.searchParams.get('sort')).toBe('updatedAt');
  expect(target.searchParams.get('order')).toBe('asc');
  expect(target.searchParams.get('pageSize')).toBe('10');
  expect(target.searchParams.get('page')).toBe('1');
});

it('intermediate route commits preserve newer filter intentions and rapid sort cycles', () => {
  navigation.query = 'pageSize=5';
  const view = render(example(<ListWorkbench />));
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索内容' }), {
    target: { value: '媒体' },
  });
  fireEvent.click(screen.getByRole('button', { name: '搜索' }));
  fireEvent.change(screen.getByRole('combobox', { name: '按状态筛选' }), {
    target: { value: 'draft' },
  });
  navigation.query = 'pageSize=5&q=%E5%AA%92%E4%BD%93';
  view.rerender(example(<ListWorkbench />));
  expect(screen.getByRole('combobox', { name: '按状态筛选' })).toHaveValue('draft');
  fireEvent.click(screen.getByRole('button', { name: '标题' }));
  fireEvent.click(screen.getByRole('button', { name: '标题' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?pageSize=5&q=%E5%AA%92%E4%BD%93&status=draft&sort=title&order=desc',
    { scroll: false },
  );
  fireEvent.click(screen.getByRole('button', { name: '标题' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?pageSize=5&q=%E5%AA%92%E4%BD%93&status=draft',
    { scroll: false },
  );
});

it('real back and forward traversal replace pending query intentions before the router rerenders', async () => {
  window.history.replaceState({ entry: 'historical' }, '', '/ui/lists?q=historical&pageSize=5');
  window.history.pushState({ entry: 'present' }, '', '/ui/lists?q=present&pageSize=10');
  navigation.query = 'q=present&pageSize=10';
  const view = render(example(<ListWorkbench />));
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索内容' }), {
    target: { value: 'pending' },
  });
  fireEvent.click(screen.getByRole('button', { name: '搜索' }));
  await act(async () => {
    window.history.back();
    await new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true });
    });
  });
  expect(window.history.state).toEqual({ entry: 'historical' });
  expect(screen.getByRole('searchbox', { name: '搜索内容' })).toHaveValue('historical');
  navigation.query = new URLSearchParams(window.location.search).toString();
  view.rerender(example(<ListWorkbench />));
  fireEvent.change(screen.getByRole('combobox', { name: '按状态筛选' }), {
    target: { value: 'draft' },
  });
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?q=historical&pageSize=5&status=draft',
    { scroll: false },
  );
  await act(async () => {
    window.history.forward();
    await new Promise<void>((resolve) => {
      window.addEventListener('popstate', () => resolve(), { once: true });
    });
  });
  expect(window.history.state).toEqual({ entry: 'present' });
  expect(screen.getByRole('searchbox', { name: '搜索内容' })).toHaveValue('present');
  expect(screen.getByRole('combobox', { name: '按状态筛选' })).toHaveValue('all');
  fireEvent.click(screen.getByRole('button', { name: '标题' }));
  expect(navigation.push).toHaveBeenLastCalledWith(
    '/ui/lists?q=present&pageSize=10&sort=title&order=asc',
    { scroll: false },
  );
  window.history.replaceState(null, '', '/');
});
