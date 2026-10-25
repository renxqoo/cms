import {
  CircleHelpIcon,
  FileClockIcon,
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
} as const;

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
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
        return route;
    }
  }
  return null;
}

export function safeAdminDestination(value: unknown): string {
  return typeof value === 'string' && matchAdminRoute(value) ? value : '/dashboard';
}

function isAdminIcon(value: string): value is AdminIcon {
  return Object.hasOwn(adminIcons, value);
}

export function getAdminRoute(id: AdminRouteId): AdminRoute {
  const route = adminRoutes.find((item) => item.id === id);
  if (!route) throw new Error('Unknown admin route');
  return route;
}
