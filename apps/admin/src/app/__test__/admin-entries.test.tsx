import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ShellProvider } from '../../components/shell/shell-provider';
import { parsePreferences } from '../../config/preferences';
import AdminLayout from '../(admin)/layout';
import DashboardPage from '../(admin)/dashboard/page';

const mock = vi.hoisted(() => ({ requireSession: vi.fn<() => Promise<unknown>>() }));
vi.mock('../../server/require-session', () => ({ requireSession: mock.requireSession }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn<() => void>(), replace: vi.fn<() => void>() }),
}));
afterEach(() => vi.resetAllMocks());

it('verifies the server session at both the shared layout and dashboard data entry', async () => {
  mock.requireSession.mockResolvedValue({
    id: 'verified',
    email: 'verified@example.test',
    displayName: 'Verified user',
    role: { name: 'Verified role' },
  });
  const page = await DashboardPage();
  const layout = await AdminLayout({ children: page });
  const markup = renderToStaticMarkup(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>{layout}</ShellProvider>,
  );
  expect(markup).toContain('Verified user');
  expect(markup).toContain('verified@example.test');
  expect(markup).toContain('Verified role');
  expect(mock.requireSession).toHaveBeenCalledTimes(2);
});

it('does not construct protected route output after a rejected session', async () => {
  mock.requireSession.mockRejectedValue(new Error('Redirect to /login'));
  await expect(DashboardPage()).rejects.toThrow('Redirect to /login');
  await expect(AdminLayout({ children: 'Private content' })).rejects.toThrow('Redirect to /login');
});
