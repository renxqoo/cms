import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { UsersIcon } from 'lucide-react';
import { AppShell } from '../app-shell';
import { ShellProvider } from '../shell-provider';
import { parsePreferences } from '../../../config/preferences';

const navigation = vi.hoisted(() => ({ push: vi.fn<() => void>() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/admins/11111111-1111-4111-8111-111111111111',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: navigation.push, replace: vi.fn<() => void>() }),
}));

it('highlights a parent page for a detail and never creates a link for a disabled server page', () => {
  render(
    <ShellProvider initial={parsePreferences({ locale: 'en' })}>
      <AppShell
        surface={{
          homeHref: '/dashboard',
          activeHref: '/dashboard/admins',
          subtitle: 'CMS',
          groups: [
            {
              id: 'management',
              label: 'Team',
              items: [
                { href: '/dashboard/admins', label: 'Users', icon: UsersIcon },
                {
                  href: 'javascript:unsafe',
                  label: 'Legacy page unavailable',
                  icon: UsersIcon,
                  disabled: true,
                },
              ],
            },
          ],
          footer: <span>Verified profile</span>,
          account: <button>Profile</button>,
          breadcrumbs: [
            { id: 'users', label: 'Users' },
            { id: 'detail', label: 'Details' },
          ],
        }}
      >
        <h1>Admin detail</h1>
      </AppShell>
    </ShellProvider>,
  );
  const sidebar = within(screen.getByRole('complementary', { name: 'Navigation menu' }));
  expect(sidebar.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
  const disabled = screen.getByRole('link', { name: 'Legacy page unavailable' });
  expect(disabled).toHaveAttribute('aria-disabled', 'true');
  expect(disabled).not.toHaveAttribute('href');
  fireEvent.click(disabled);
  expect(navigation.push).not.toHaveBeenCalled();
});
