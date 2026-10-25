import type { OperationDefinition } from '@new-cms/cms/platform/contracts';

interface Declaration {
  id: string;
  method: OperationDefinition['method'];
  path: string;
  access: OperationDefinition['access'];
  defaultPermission?: string;
}

const declarations: Declaration[] = [
  {
    id: 'admins.list',
    method: 'GET',
    path: '/admins',
    access: 'permission',
    defaultPermission: 'admins:read',
  },
  {
    id: 'admins.get',
    method: 'GET',
    path: '/admins/:id',
    access: 'permission',
    defaultPermission: 'admins:read',
  },
  { id: 'admins.create', method: 'POST', path: '/admins', access: 'security' },
  { id: 'admins.update', method: 'PATCH', path: '/admins/:id', access: 'security' },
  { id: 'admins.invite', method: 'POST', path: '/admins/:id/invitations', access: 'security' },
  {
    id: 'roles.list',
    method: 'GET',
    path: '/roles',
    access: 'permission',
    defaultPermission: 'roles:read',
  },
  {
    id: 'roles.get',
    method: 'GET',
    path: '/roles/:id',
    access: 'permission',
    defaultPermission: 'roles:read',
  },
  { id: 'roles.create', method: 'POST', path: '/roles', access: 'security' },
  { id: 'roles.update', method: 'PATCH', path: '/roles/:id', access: 'security' },
  {
    id: 'roles.replacePermissions',
    method: 'PUT',
    path: '/roles/:id/permissions',
    access: 'security',
  },
  { id: 'roles.delete', method: 'DELETE', path: '/roles/:id', access: 'security' },
  {
    id: 'permissions.list',
    method: 'GET',
    path: '/permissions',
    access: 'permission',
    defaultPermission: 'permissions:read',
  },
  { id: 'permissions.create', method: 'POST', path: '/permissions', access: 'security' },
  { id: 'permissions.update', method: 'PATCH', path: '/permissions/:id', access: 'security' },
  { id: 'permissions.delete', method: 'DELETE', path: '/permissions/:id', access: 'security' },
  {
    id: 'navigation.list',
    method: 'GET',
    path: '/navigation',
    access: 'permission',
    defaultPermission: 'navigation:read',
  },
  { id: 'navigation.create', method: 'POST', path: '/navigation', access: 'security' },
  { id: 'navigation.update', method: 'PATCH', path: '/navigation/:id', access: 'security' },
  { id: 'navigation.delete', method: 'DELETE', path: '/navigation/:id', access: 'security' },
  {
    id: 'endpoints.list',
    method: 'GET',
    path: '/endpoints',
    access: 'permission',
    defaultPermission: 'endpoints:read',
  },
  { id: 'endpoints.createBinding', method: 'POST', path: '/endpoint-bindings', access: 'security' },
  {
    id: 'endpoints.updateBinding',
    method: 'PATCH',
    path: '/endpoint-bindings/:id',
    access: 'security',
  },
  {
    id: 'endpoints.deleteBinding',
    method: 'DELETE',
    path: '/endpoint-bindings/:id',
    access: 'security',
  },
  { id: 'access.me', method: 'GET', path: '/me', access: 'authenticated' },
  { id: 'access.updateOwnProfile', method: 'PATCH', path: '/me', access: 'authenticated' },
  { id: 'access.myNavigation', method: 'GET', path: '/me/navigation', access: 'authenticated' },
  { id: 'access.myOperations', method: 'GET', path: '/me/operations', access: 'authenticated' },
  {
    id: 'audit.list',
    method: 'GET',
    path: '/audit-logs',
    access: 'permission',
    defaultPermission: 'audit:read',
  },
];

export const accessOperations: readonly OperationDefinition[] = declarations.map((declaration) => ({
  ...declaration,
  path: `/v1${declaration.path}`,
  module: 'access',
  scopeKind: 'global',
  bindingConfigurable: declaration.access === 'permission',
}));
