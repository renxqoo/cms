import {
  CircleHelpIcon,
  FileClockIcon,
  FilesIcon,
  ImageIcon,
  HomeIcon,
  KeyRoundIcon,
  NetworkIcon,
  RouteIcon,
  ShieldCheckIcon,
  UserRoundIcon,
  UsersIcon,
} from 'lucide-react';

export const adminIcons = {
  home: HomeIcon,
  user: UserRoundIcon,
  users: UsersIcon,
  shield: ShieldCheckIcon,
  key: KeyRoundIcon,
  navigation: RouteIcon,
  network: NetworkIcon,
  audit: FileClockIcon,
  collections: FilesIcon,
  resources: ImageIcon,
} as const;

export const adminRequestPathHeader = 'x-oneaster-admin-path';

export const adminRoutes = [
  {
    id: 'dashboard',
    path: '/dashboard',
    icon: 'home',
    label: { zh: '概览', en: 'Dashboard' },
    operation: null,
    detail: false,
  },
  {
    id: 'account',
    path: '/dashboard/account',
    icon: 'user',
    label: { zh: '账户设置', en: 'Account settings' },
    operation: null,
    detail: false,
  },
  {
    id: 'credentials',
    path: '/dashboard/account/credentials',
    icon: 'key',
    label: { zh: '个人访问凭据', en: 'Personal access credentials' },
    operation: null,
    detail: false,
  },
  {
    id: 'admins',
    path: '/dashboard/admins',
    icon: 'users',
    label: { zh: '用户管理', en: 'Users' },
    operation: 'admins.list',
    detail: true,
  },
  {
    id: 'roles',
    path: '/dashboard/roles',
    icon: 'shield',
    label: { zh: '角色管理', en: 'Roles' },
    operation: 'roles.list',
    detail: true,
  },
  {
    id: 'permissions',
    path: '/dashboard/permissions',
    icon: 'key',
    label: { zh: '权限管理', en: 'Permissions' },
    operation: 'permissions.list',
    detail: false,
  },
  {
    id: 'navigation',
    path: '/dashboard/navigation',
    icon: 'navigation',
    label: { zh: '导航管理', en: 'Navigation' },
    operation: 'navigation.list',
    detail: false,
  },
  {
    id: 'endpoints',
    path: '/dashboard/endpoints',
    icon: 'network',
    label: { zh: '接口管理', en: 'Endpoints' },
    operation: 'endpoints.list',
    detail: false,
  },
  {
    id: 'recovery',
    path: '/dashboard/access-recovery',
    icon: 'shield',
    label: { zh: '访问恢复', en: 'Access recovery' },
    operation: 'access.readRecovery',
    detail: false,
  },
  {
    id: 'audit',
    path: '/dashboard/audit-logs',
    icon: 'audit',
    label: { zh: '审计日志', en: 'Audit logs' },
    operation: 'audit.list',
    detail: false,
  },
  {
    id: 'collections',
    path: '/dashboard/collections',
    icon: 'collections',
    label: { zh: '内容集合', en: 'Collections' },
    operation: 'collections.list',
    detail: 'collection',
  },
  {
    id: 'resources',
    path: '/dashboard/resources',
    icon: 'resources',
    label: { zh: '资源管理', en: 'Resources' },
    operation: 'resources.list',
    detail: false,
  },
  {
    id: 'jobs',
    path: '/dashboard/jobs',
    icon: 'audit',
    label: { zh: '任务管理', en: 'Jobs' },
    operation: 'collections.list',
    detail: false,
  },
  {
    id: 'asset-cleanups',
    path: '/dashboard/asset-cleanups',
    icon: 'resources',
    label: { zh: '资源清理', en: 'Asset cleanups' },
    operation: 'assets.listCleanup',
    detail: false,
  },
] as const;

export type AdminRoute = (typeof adminRoutes)[number];
export type AdminRouteId = AdminRoute['id'];
export type AdminIcon = keyof typeof adminIcons;

export function registeredAdminIcon(value: string | null) {
  return value && isAdminIcon(value) ? adminIcons[value] : CircleHelpIcon;
}

export function matchAdminRoute(pathname: string): AdminRoute | null {
  for (const route of adminRoutes) {
    if (pathname === route.path) return route;
    if (route.detail && pathname.startsWith(`${route.path}/`)) {
      const id = pathname.slice(route.path.length + 1);
      if (route.detail === 'collection') {
        const [key, detail, extra] = id.split('/');
        if (
          key &&
          /^[a-z][a-z0-9_-]{0,63}$/.test(key) &&
          extra === undefined &&
          (detail === undefined || detail === 'new' || detail === 'structure' || uuidPath(detail))
        )
          return route;
      } else if (uuidPath(id)) return route;
    }
  }
  return null;
}

function uuidPath(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function safeAdminDestination(value: unknown): string {
  return typeof value === 'string' && matchAdminRoute(value) ? value : '/dashboard';
}

export function activeAdminHref(pathname: string, hrefs: readonly string[]): string {
  const route = matchAdminRoute(pathname);
  const visible = hrefs
    .filter(
      (href) =>
        route &&
        matchAdminRoute(href)?.id === route.id &&
        (pathname === href || pathname.startsWith(`${href}/`)),
    )
    .toSorted((left, right) => right.length - left.length);
  return visible[0] ?? route?.path ?? pathname;
}

function isAdminIcon(value: string): value is AdminIcon {
  return Object.hasOwn(adminIcons, value);
}

export function getAdminRoute(id: AdminRouteId): AdminRoute {
  const route = adminRoutes.find((item) => item.id === id);
  if (!route) throw new Error('Unknown admin route');
  return route;
}
