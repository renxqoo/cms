import { expect, it } from 'vitest';
import { CircleHelpIcon, UsersIcon } from 'lucide-react';
import {
  getAdminRoute,
  matchAdminRoute,
  registeredAdminIcon,
  safeAdminDestination,
} from '../admin-routes';

it.each([
  '/dashboard',
  '/dashboard/account',
  '/dashboard/admins',
  '/dashboard/roles',
  '/dashboard/permissions',
  '/dashboard/navigation',
  '/dashboard/endpoints',
  '/dashboard/audit-logs',
  '/dashboard/collections',
  '/dashboard/collections/articles',
  '/dashboard/collections/articles/new',
  '/dashboard/collections/articles/structure',
  '/dashboard/collections/articles/11111111-1111-4111-8111-111111111111',
  '/dashboard/resources',
  '/dashboard/jobs',
  '/dashboard/asset-cleanups',
  '/dashboard/admins/11111111-1111-4111-8111-111111111111',
  '/dashboard/roles/11111111-1111-4111-8111-111111111111',
])('accepts an implemented administrative return destination %s', (href) => {
  expect(safeAdminDestination(href)).toBe(href);
});
it.each([
  undefined,
  null,
  '',
  ['https://external.test'],
  'https://external.test',
  '//external.test',
  '/dashboard/../ui',
  '/dashboard/admins/../../ui',
  '/dashboard/admins/not-an-id',
  '/dashboard/admins/11111111-1111-4111-8111-111111111111/unknown',
  '/dashboard%2fadmins',
  '/dashboard/collections/Articles',
  '/dashboard/collections/articles/',
  '/dashboard/collections/articles/new/extra',
  '/dashboard/collections/articles/not-a-document-id',
  '/dashboard/collections/articles/../admins',
  '/dashboard\\admins',
  '/dashboard\n',
  '/dashboard?next=https://external.test',
  '/dashboard#private',
  '/ui',
  '/login',
  '/forgot-password',
])('rejects an unregistered or ambiguous return destination %j', (href) => {
  expect(safeAdminDestination(href)).toBe('/dashboard');
});
it('matches a detail to its visible parent and resolves only own registered icon keys', () => {
  expect(matchAdminRoute('/dashboard/admins/11111111-1111-4111-8111-111111111111')?.path).toBe(
    '/dashboard/admins',
  );
  expect(matchAdminRoute('/dashboard/permissions/not-a-registered-detail')).toBeNull();
  expect(registeredAdminIcon('users')).toBe(UsersIcon);
  expect(registeredAdminIcon('constructor')).toBe(CircleHelpIcon);
  expect(registeredAdminIcon(null)).toBe(CircleHelpIcon);
  expect(getAdminRoute('account').path).toBe('/dashboard/account');
});
