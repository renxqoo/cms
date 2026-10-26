import { expect, it, vi } from 'vitest';
import { CircleHelpIcon } from 'lucide-react';
import type { VisibleNavigation } from '../../../contracts/auth';
import { shellNavigation } from '../navigation';

function node(input: Partial<VisibleNavigation> = {}): VisibleNavigation {
  return {
    id: 'node-id',
    type: 'page',
    name: 'Team',
    path: '/dashboard/admins',
    icon: null,
    children: [],
    ...input,
  };
}
function group(children: VisibleNavigation[]): VisibleNavigation {
  return node({ id: 'group', type: 'group', name: 'Team management', path: null, children });
}

it('keeps self-service available while empty-menu application entries require real operations', () => {
  const navigation = shellNavigation({
    navigation: [],
    locale: 'en',
    can: (operation) => operation === 'admins.list',
  });
  expect(navigation.groups.map((item) => item.label)).toEqual(['Workspace', 'Application entries']);
  expect(navigation.groups.flatMap((item) => item.items.map((link) => link.href))).toEqual([
    '/dashboard',
    '/dashboard/account',
    '/dashboard/admins',
  ]);
  expect(navigation.empty).toBe(true);
  const denied = shellNavigation({ navigation: [], locale: 'zh', can: () => false });
  expect(denied.groups.flatMap((item) => item.items.map((link) => link.href))).toEqual([
    '/dashboard',
    '/dashboard/account',
  ]);
});

it('preserves real group/page labels without turning action nodes into links or permissions', () => {
  const can = vi.fn<(operation: string) => boolean>();
  const navigation = shellNavigation({
    navigation: [
      group([node({ children: [node({ type: 'action', name: 'Delete', path: null })] })]),
    ],
    locale: 'en',
    can,
  });
  expect(navigation.groups[1]?.label).toBe('Team management');
  expect(navigation.groups[1]?.items.map((item) => [item.href, item.label])).toEqual([
    ['/dashboard/admins', 'Team'],
  ]);
  expect(navigation.empty).toBe(false);
  expect(can).not.toHaveBeenCalled();
});

it('disables unknown pages and uses a safe icon fallback instead of interpreting API strings', () => {
  const navigation = shellNavigation({
    navigation: [group([node({ path: 'javascript:alert(1)', icon: 'constructor' })])],
    locale: 'en',
    can: () => false,
  });
  const entry = navigation.groups[1]?.items[0];
  expect(entry).toMatchObject({ disabled: true, href: 'unavailable-node-id' });
  expect(entry?.icon).toBe(CircleHelpIcon);
  expect(entry?.label).toContain('Page unavailable');
  expect(navigation.invalid).toBe(true);
});

it('does not create duplicate sidebar keys or duplicate built-in self-service entries', () => {
  const navigation = shellNavigation({
    navigation: [
      group([
        node({ path: '/dashboard' }),
        node(),
        node({ id: 'duplicate', name: 'Duplicate users' }),
      ]),
    ],
    locale: 'en',
    can: () => false,
  });
  const paths = navigation.groups.flatMap((item) => item.items.map((entry) => entry.href));
  expect(paths).toEqual(['/dashboard', '/dashboard/account', '/dashboard/admins']);
  expect(new Set(paths).size).toBe(paths.length);
});

it('does not trust a malformed root page to bypass the group structure', () => {
  const navigation = shellNavigation({ navigation: [node()], locale: 'zh', can: () => false });
  expect(navigation.invalid).toBe(true);
  expect(navigation.groups).toHaveLength(1);
});

it('keeps a registered collection page destination and disables arbitrary nested paths', () => {
  const navigation = shellNavigation({
    navigation: [
      group([
        node({ id: 'articles', path: '/dashboard/collections/articles' }),
        node({ id: 'invalid', path: '/dashboard/collections/articles/arbitrary' }),
      ]),
    ],
    locale: 'en',
    can: () => false,
  });
  expect(navigation.groups[1]?.items).toMatchObject([
    { href: '/dashboard/collections/articles', disabled: false },
    { href: 'unavailable-invalid', disabled: true },
  ]);
});
