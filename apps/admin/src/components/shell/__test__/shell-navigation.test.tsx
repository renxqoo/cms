import { afterEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { parsePreferences } from '../../../config/preferences';
import { AppShell } from '../app-shell';
import { ShellProvider } from '../shell-provider';

vi.mock('next/navigation', () => ({ usePathname: () => '/ui/lists' }));

const initialMatchMedia = window.matchMedia;

function media(desktop: boolean) {
  const query = initialMatchMedia('(min-width: 768px)');
  const add = vi.fn<(type: string, listener: () => void) => void>();
  const remove = vi.fn<(type: string, listener: () => void) => void>();
  const result = Object.assign(query, {
    matches: desktop,
    addEventListener: add,
    removeEventListener: remove,
  });
  vi.spyOn(window, 'matchMedia').mockReturnValue(result);
  return { query: result, add, remove };
}

function renderShell() {
  return render(
    <ShellProvider initial={parsePreferences({})}>
      <AppShell>
        <h1>Example content</h1>
      </AppShell>
    </ShellProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('desktop collapse retains accessible navigation and restores expanded groups', () => {
  media(true);
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: '切换侧栏' }));
  expect(screen.queryByRole('button', { name: '收起组合场景' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '列表与搜索' })).toHaveAttribute('title', '列表与搜索');
  expect(document.cookie).toContain('oneaster-sidebar=false');
  fireEvent.click(screen.getByRole('button', { name: '切换侧栏' }));
  expect(screen.getByRole('button', { name: '收起组合场景' })).toBeInTheDocument();
  expect(document.cookie).toContain('oneaster-sidebar=true');
});

it('navigation group preferences use stable IDs across language changes', () => {
  media(true);
  renderShell();
  fireEvent.click(screen.getByRole('button', { name: '收起组合场景' }));
  expect(screen.queryByRole('link', { name: '列表与搜索' })).not.toBeInTheDocument();
  expect(document.cookie).toContain('oneaster-navigation-groups=%5B%22patterns%22%5D');
  fireEvent.click(screen.getByRole('button', { name: '切换语言' }));
  expect(screen.getByRole('button', { name: 'Expand Composed examples' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Expand Composed examples' }));
  expect(screen.getByRole('link', { name: 'Lists and search' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('mobile navigation closes on selection and on a change to desktop layout', async () => {
  const control = media(false);
  const view = renderShell();
  const toggle = screen.getByRole('button', { name: '切换侧栏' });
  toggle.focus();
  fireEvent.click(toggle);
  expect(await screen.findByRole('dialog', { name: '导航菜单' })).toBeInTheDocument();
  const link = screen.getByRole('link', { name: '列表与搜索' });
  const click = createEvent.click(link);
  click.preventDefault();
  fireEvent(link, click);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(toggle);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
  Object.defineProperty(control.query, 'matches', { value: true });
  const listener = control.add.mock.calls[0]?.[1];
  act(() => listener?.());
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  view.unmount();
  expect(control.remove).toHaveBeenCalledWith('change', listener);
});
