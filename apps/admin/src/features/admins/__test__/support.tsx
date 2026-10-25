import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { AdminDetail, RoleListItem } from '../../../contracts/access';
import type { Me } from '../../../contracts/auth';
import { ShellProvider } from '../../../components/shell/shell-provider';
import { parsePreferences } from '../../../config/preferences';

export const actor: Me = {
  id: '10000000-0000-4000-8000-000000000001',
  email: 'actor@example.test',
  displayName: 'Actor',
  version: 3,
  roleId: '20000000-0000-4000-8000-000000000001',
  roleCode: 'super_admin',
  status: 'active',
  activation: 'activated',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  lastLoginAt: null,
  role: {
    id: '20000000-0000-4000-8000-000000000001',
    code: 'super_admin',
    name: 'Super admins',
    status: 'active',
    isSuper: true,
  },
};
export const subject: AdminDetail = {
  id: '10000000-0000-4000-8000-000000000002',
  email: 'subject@example.test',
  displayName: 'Subject',
  version: 7,
  roleId: '20000000-0000-4000-8000-000000000002',
  roleCode: 'editor',
  status: 'active',
  activation: 'pending',
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  lastLoginAt: null,
  invitationDelivery: null,
};
export const roles: RoleListItem[] = [
  {
    id: subject.roleId,
    version: 1,
    code: 'editor',
    name: 'Editors',
    description: null,
    status: 'active',
    isSuper: false,
    adminCount: 1,
    permissionCount: 2,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    version: 1,
    code: 'reviewer',
    name: 'Reviewers',
    description: null,
    status: 'active',
    isSuper: false,
    adminCount: 0,
    permissionCount: 1,
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt,
  },
];

export function adminContent(children: ReactNode, locale: 'zh' | 'en' = 'en') {
  return <ShellProvider initial={parsePreferences({ locale })}>{children}</ShellProvider>;
}
export function renderAdmin(children: ReactNode, locale: 'zh' | 'en' = 'en') {
  return render(adminContent(children, locale));
}
