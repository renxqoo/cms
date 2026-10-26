import type { VisibleNavigation } from '../../contracts/auth';
import {
  adminIcons,
  adminRoutes,
  matchAdminRoute,
  registeredAdminIcon,
} from '../../config/admin-routes';
import type { ShellGroup } from '../../components/shell/shell-surface';
import { managementMessages } from '../management-shared/messages';

type Locale = 'zh' | 'en';

function routeItem(route: (typeof adminRoutes)[number], locale: Locale) {
  return { href: route.path, label: route.label[locale], icon: adminIcons[route.icon] };
}

function pageItem(page: VisibleNavigation, locale: Locale) {
  const route = page.path ? matchAdminRoute(page.path) : null;
  const t = managementMessages[locale];
  return {
    href: route && page.path ? page.path : `unavailable-${page.id}`,
    label: route ? page.name : `${page.name} · ${t.unavailable}`,
    icon: page.icon === null && route ? adminIcons[route.icon] : registeredAdminIcon(page.icon),
    disabled: !route,
  };
}

export function shellNavigation(input: {
  navigation: readonly VisibleNavigation[];
  locale: Locale;
  can: (operationId: string) => boolean;
}) {
  const { locale } = input;
  const t = managementMessages[locale];
  const self = adminRoutes
    .filter((route) => route.operation === null)
    .map((route) => routeItem(route, locale));
  const seen = new Set(self.map((item) => item.href as string));
  const groups: ShellGroup[] = [{ id: 'workspace', label: t.workspace, items: self }];
  let invalid = false;
  let pages = 0;
  for (const group of input.navigation) {
    if (group.type !== 'group') {
      invalid = true;
      continue;
    }
    const items = group.children
      .filter((page) => page.type === 'page')
      .map((page) => pageItem(page, locale))
      .filter((page) => {
        if (seen.has(page.href)) return false;
        seen.add(page.href);
        if (page.disabled) invalid = true;
        else pages += 1;
        return true;
      });
    if (items.length > 0) groups.push({ id: group.id, label: group.name, items });
  }
  if (pages === 0) {
    const items = adminRoutes
      .filter((route) => route.operation !== null && input.can(route.operation))
      .map((route) => routeItem(route, locale));
    if (items.length > 0) groups.push({ id: 'application-entries', label: t.entries, items });
    pages += items.length;
  }
  return { groups, invalid, empty: pages === 0 };
}
