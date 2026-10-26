import type { ReactNode } from 'react';
import { render } from '@testing-library/react';
import { ShellProvider } from '../../apps/admin/src/components/shell/shell-provider';
import { AppNavigationProvider } from '../../apps/admin/src/components/shell/navigation/provider';
import { parsePreferences } from '../../apps/admin/src/config/preferences';
import type { ApiResult } from '../../apps/admin/src/api/result';
import type {
  Audit,
  Endpoint,
  NavigationTree,
  Permission,
  RoleDetail,
} from '../../apps/admin/src/contracts/access';

const time = '2026-10-26T00:00:00.000Z';

export function ManagementTestProvider({
  children,
  locale = 'en',
}: {
  children: ReactNode;
  locale?: 'zh' | 'en';
}) {
  return (
    <ShellProvider initial={parsePreferences({ locale })}>
      <AppNavigationProvider>{children}</AppNavigationProvider>
    </ShellProvider>
  );
}

export function renderManagement(children: ReactNode, locale: 'zh' | 'en' = 'en') {
  return render(<ManagementTestProvider locale={locale}>{children}</ManagementTestProvider>);
}

export function managementSuccess<T>(data: T, status = 200): ApiResult<T> {
  return { ok: true, status, data, requestId: 'test-request' };
}

export function managementRole(overrides: Partial<RoleDetail> = {}): RoleDetail {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    version: 7,
    code: 'editor',
    name: 'Editorial team',
    description: null,
    status: 'active',
    isSuper: false,
    permissionIds: ['22222222-2222-4222-8222-222222222222'],
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}

export function managementPermission(overrides: Partial<Permission> = {}): Permission {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    version: 3,
    code: 'content:read',
    name: 'Read content',
    description: null,
    status: 'active',
    scopeKind: 'global',
    collectionKey: null,
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}

export function managementEndpoint(overrides: Partial<Endpoint> = {}): Endpoint {
  return {
    operationId: 'roles.list',
    module: 'access',
    method: 'GET',
    path: '/v1/roles',
    accessKind: 'permission',
    bindingConfigurable: true,
    scopeKind: 'global',
    collectionKey: null,
    binding: {
      id: '33333333-3333-4333-8333-333333333333',
      permissionId: '22222222-2222-4222-8222-222222222222',
      version: 4,
    },
    ...overrides,
  };
}

export function managementNavigation(overrides: Partial<NavigationTree> = {}): NavigationTree {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    version: 2,
    type: 'group',
    name: 'Management',
    parentId: null,
    path: null,
    icon: null,
    sortOrder: 0,
    status: 'active',
    visibility: 'container',
    permissionId: null,
    children: [],
    createdAt: time,
    updatedAt: time,
    ...overrides,
  };
}

export function managementAudit(overrides: Partial<Audit> = {}): Audit {
  return {
    id: '55555555-5555-4555-8555-555555555555',
    actorKind: 'admin',
    actorId: '66666666-6666-4666-8666-666666666666',
    operationId: 'roles.update',
    targetType: 'role',
    targetId: '11111111-1111-4111-8111-111111111111',
    requestId: 'audit-request-abc',
    detail: { name: 'Reviewed name' },
    createdAt: time,
    ...overrides,
  };
}
